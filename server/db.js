/**
 * 資料庫連線（兩種模式，同一套 SQL）：
 *  - 有 DATABASE_URL：連 PostgreSQL（正式環境用 Google Cloud SQL）
 *  - 沒有：用 PGlite（在程式裡跑的真正 PostgreSQL，本機開發與自動化測試用，不用另外裝資料庫）
 */
const fs = require('fs');
const path = require('path');

/** 只給自動化測試用：設了 TEST_PG_ADMIN_URL（而且 NODE_ENV=test）就在真正的 PostgreSQL 裡替每次測試開一個全新的資料庫，結束時刪掉。
 *  這樣整套測試可以對正式環境用的資料庫與驅動（pg）再跑一次，不只是 PGlite。 */
async function tempDatabase(adminUrl) {
  const { Pool } = require('pg'), name = 't_' + require('crypto').randomBytes(6).toString('hex'), admin = new Pool({ connectionString: adminUrl, max: 1 });
  await admin.query(`CREATE DATABASE ${name}`);
  const u = new URL(adminUrl); u.pathname = '/' + name;
  const drop = async () => {                                                            // 連線剛關完時伺服器那邊可能還沒清乾淨：不強制中斷，等一下再試
    for (let i = 0; i < 40; i++) { try { await admin.query(`DROP DATABASE IF EXISTS ${name}`); break; } catch (e) { if (e.code !== '55006' || i === 39) throw e; await new Promise(r => setTimeout(r, 50)); } }
    await admin.end();
  };
  return { url: u.toString(), drop };
}

async function createDb({ url, dataDir } = {}) {
  let q, close, tx, drop = null;
  if (!url && !dataDir && process.env.NODE_ENV === 'test' && process.env.TEST_PG_ADMIN_URL) { const t = await tempDatabase(process.env.TEST_PG_ADMIN_URL); url = t.url; drop = t.drop; }
  if (url) {
    const { Pool } = require('pg');
    const pool = new Pool({ connectionString: url, max: 5 });
    pool.on('error', e => console.error('資料庫閒置連線出錯（會自動重連）：', e.message));   // 資料庫重開機或主備切換時閒置連線會斷；沒有這行，Node 會當成未處理的錯誤直接結束程式
    q = (sql, params) => pool.query(sql, params);
    close = async () => { await pool.end(); if (drop) await drop(); };
    tx = async fn => {   // 同一條連線上的交易：全部成功才寫入，中途失敗就全部復原
      const c = await pool.connect();
      try { await c.query('BEGIN'); const r = await fn((sql, params) => c.query(sql, params)); await c.query('COMMIT'); return r; }
      catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
    };
  } else {
    const { PGlite } = require('@electric-sql/pglite');
    const pg = new PGlite(dataDir);   // 沒給資料夾就只存在記憶體
    await pg.waitReady;
    q = (sql, params) => pg.query(sql, params);
    close = () => pg.close();
    tx = fn => pg.transaction(t => fn((sql, params) => t.query(sql, params)));
  }
  const db = { query: q, close, tx };
  await migrate(db);
  return db;
}

/** 依檔名順序執行 migrations/*.sql，已經執行過的不再執行 */
async function migrate(db) {
  const dir = path.join(__dirname, 'migrations'), files = fs.readdirSync(dir).filter(x => x.endsWith('.sql')).sort();
  // 整個過程在一個交易裡，並先拿「諮詢鎖」：Cloud Run 同時起好幾個實例時，只有一個在建表，其他的等它做完再看（不會重複建、也不會建一半）
  await db.tx(async q => {
    await q('SELECT pg_advisory_xact_lock(727274)');
    await q('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, at timestamptz NOT NULL DEFAULT now())');   // 連這句同時執行也會打架，所以放在鎖後面
    const done = new Set((await q('SELECT name FROM schema_migrations')).rows.map(r => r.name));
    for (const f of files) {
      if (done.has(f)) continue;
      for (const stmt of splitSql(fs.readFileSync(path.join(dir, f), 'utf8'))) await q(stmt);
      await q('INSERT INTO schema_migrations (name) VALUES ($1)', [f]);
    }
  });
}

/** 把 SQL 檔切成一句一句：分號結尾才算一句，但 $$ ... $$ 之間（函式內容）的分號不算；整行註解先拿掉 */
function splitSql(text) {
  const t = text.replace(/^\s*--.*$/gm, '');
  const out = []; let cur = '', dollar = false;
  for (let i = 0; i < t.length; i++) {
    if (t.startsWith('$$', i)) { dollar = !dollar; cur += '$$'; i++; continue; }
    if (t[i] === ';' && !dollar) { if (cur.trim()) out.push(cur.trim()); cur = ''; continue; }
    cur += t[i];
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

module.exports = { createDb, migrate, splitSql, tempDatabase };
