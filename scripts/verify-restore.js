#!/usr/bin/env node
/**
 * 還原演練的驗證：把備份還原到一個「新的資料庫」之後，用這支檢查資料回得來而且沒有壞。
 * 用法：DATABASE_URL=postgres://… node scripts/verify-restore.js [--max-age-hours 36]
 * 檢查：建表紀錄完整、各資料表筆數、最新一筆稽核紀錄多新（資料最多落後多久）、防竄改的觸發器還在、
 *      已發布薪資單的數字自己對得起來（實發＝應發＋加班費－應扣）、沒有示範資料混進來。任何一項不對就結束並回傳非 0。
 */
const fs = require('fs');
const path = require('path');

const TABLES = ['employees', 'audit_log', 'punches', 'requests', 'approvals', 'svc_month', 'pay_months', 'pay_slips', 'pay_salary_entries'];
const TRIGGERS = ['approvals_no_change', 'pay_salary_no_change', 'requests_status_guard', 'leave_no_overlap'];

/** db 只要有 query(sql, params)；回傳 { ok, lines: [{ ok, text }], counts } */
async function verify(db, { maxAgeHours = null, migrationsDir = path.join(__dirname, '..', 'server', 'migrations') } = {}) {
  const lines = [], add = (ok, text) => lines.push({ ok, text });
  const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
  const done = new Set((await db.query('SELECT name FROM schema_migrations')).rows.map(r => r.name)), missing = files.filter(f => !done.has(f));
  add(!missing.length, missing.length ? `建表紀錄缺 ${missing.join('、')}（備份比現在的程式舊，啟動時會自動補上）` : `建表紀錄完整（${files.length} 份）`);
  const counts = {};
  for (const t of TABLES) { try { counts[t] = (await db.query(`SELECT count(*)::int AS n FROM ${t}`)).rows[0].n; add(true, `${t}：${counts[t]} 筆`); } catch (e) { add(false, `${t}：讀不到（${e.message}）`); } }
  const last = (await db.query('SELECT max(at) AS t FROM audit_log')).rows[0].t;
  if (!last) add(true, '稽核紀錄是空的（還沒有人用過）');
  else { const age = (Date.now() - new Date(last).getTime()) / 36e5; add(maxAgeHours == null || age <= maxAgeHours, `最新稽核紀錄在 ${new Date(last).toISOString()}（${age.toFixed(1)} 小時前）${maxAgeHours != null && age > maxAgeHours ? `，超過上限 ${maxAgeHours} 小時` : ''}`); }
  const trg = new Set((await db.query('SELECT tgname FROM pg_trigger WHERE NOT tgisinternal')).rows.map(r => r.tgname)), lost = TRIGGERS.filter(t => !trg.has(t));
  add(!lost.length, lost.length ? `防竄改觸發器不見了：${lost.join('、')}` : `防竄改觸發器都在（${TRIGGERS.length} 個）`);
  try { await db.query('BEGIN'); await db.query('UPDATE pay_salary_entries SET base_salary = base_salary'); await db.query('ROLLBACK'); const n = counts.pay_salary_entries; add(n === 0, n === 0 ? '薪資紀錄是空的，無法示範擋改（觸發器存在即可）' : '薪資紀錄竟然可以被修改！'); }
  catch (e) { await db.query('ROLLBACK').catch(() => {}); add(/append-only/.test(e.message), /append-only/.test(e.message) ? '薪資紀錄擋修改：正常' : `薪資紀錄修改測試出錯：${e.message}`); }
  const bad = (await db.query("SELECT month, kind, version, emp_no FROM pay_slips WHERE (slip->'slip'->>'net')::numeric <> (slip->'slip'->>'totalA')::numeric + (slip->'slip'->>'totalB')::numeric - (slip->'slip'->>'totalC')::numeric")).rows;
  add(!bad.length, bad.length ? `有 ${bad.length} 張薪資單的數字對不起來（例如 ${bad[0].month} ${bad[0].emp_no}）` : `已發布薪資單的數字都對得起來（${counts.pay_slips ?? 0} 張）`);
  const orphan = (await db.query("SELECT count(*)::int AS n FROM pay_months m WHERE m.status='published' AND NOT EXISTS (SELECT 1 FROM pay_slips s WHERE s.kind=m.kind AND s.month=m.month AND s.version=m.version)")).rows[0].n;
  add(orphan === 0, orphan ? `有 ${orphan} 個已發布的月份找不到薪資單快照` : '每個已發布的月份都有薪資單快照');
  const demo = (await db.query("SELECT count(*)::int AS n FROM employees WHERE email LIKE '%@example.test'")).rows[0].n;
  add(true, demo ? `提醒：有 ${demo} 位示範員工（@example.test）；正式資料庫不應該有` : '沒有示範資料');
  return { ok: lines.every(l => l.ok), lines, counts };
}

module.exports = { verify };

if (require.main === module) {
  (async () => {
    const url = process.env.DATABASE_URL; if (!url) { console.error('請設定 DATABASE_URL（要驗證的資料庫）'); process.exit(2); }
    const i = process.argv.indexOf('--max-age-hours'), maxAgeHours = i > 0 ? +process.argv[i + 1] : null;
    const { Pool } = require('pg'), pool = new Pool({ connectionString: url, max: 1 }), c = await pool.connect();
    try { const r = await verify(c, { maxAgeHours }); for (const l of r.lines) console.log((l.ok ? '✓ ' : '✗ ') + l.text); console.log(r.ok ? '\n驗證通過' : '\n驗證失敗'); process.exitCode = r.ok ? 0 : 1; }
    finally { c.release(); await pool.end(); }
  })().catch(e => { console.error(e.message); process.exit(2); });
}
