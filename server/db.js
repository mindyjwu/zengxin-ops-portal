/**
 * 資料庫連線（兩種模式，同一套 SQL）：
 *  - 有 DATABASE_URL：連 PostgreSQL（正式環境用 Google Cloud SQL）
 *  - 沒有：用 PGlite（在程式裡跑的真正 PostgreSQL，本機開發與自動化測試用，不用另外裝資料庫）
 */
const fs = require('fs');
const path = require('path');

async function createDb({ url, dataDir } = {}) {
  let q, close, tx;
  if (url) {
    const { Pool } = require('pg');
    const pool = new Pool({ connectionString: url, max: 5 });
    q = (sql, params) => pool.query(sql, params);
    close = () => pool.end();
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
  await db.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, at timestamptz NOT NULL DEFAULT now())');
  const dir = path.join(__dirname, 'migrations');
  const done = new Set((await db.query('SELECT name FROM schema_migrations')).rows.map(r => r.name));
  for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.sql')).sort()) {
    if (done.has(f)) continue;
    // 一個檔案裡有多個語句，逐句執行（簡單切法：分號結尾，適用我們的 migration 寫法）
    for (const stmt of fs.readFileSync(path.join(dir, f), 'utf8').split(/;\s*(?:\n|$)/).map(x => x.replace(/^\s*--.*$/gm, '').trim()).filter(Boolean)) await db.query(stmt);
    await db.query('INSERT INTO schema_migrations (name) VALUES ($1)', [f]);
  }
}

module.exports = { createDb, migrate };
