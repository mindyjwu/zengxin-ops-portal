/** 還原演練：把一個有資料的資料庫用 pg_dump 備份（和 Cloud SQL 匯出同一種純 SQL 格式）、還原到新的資料庫，驗證腳本要通過；弄壞一張薪資單、拿掉觸發器，驗證腳本要抓出來。
 *  需要真正的 PostgreSQL 與 pg_dump／psql（設 TEST_PG_ADMIN_URL）；沒有就略過。 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const request = require('supertest');
const { Pool } = require('pg');
const { createDb, tempDatabase } = require('../server/db');
const { createApp } = require('../server/app');
const { seed } = require('../server/seed');
const { verify } = require('../scripts/verify-restore');

const fsx = require('fs');
const dirs = major => [...(major ? [`/usr/lib/postgresql/${major}/bin`] : []), ...(process.env.PATH || '').split(':'), ...(fsx.existsSync('/usr/lib/postgresql') ? fsx.readdirSync('/usr/lib/postgresql').sort().reverse().map(v => `/usr/lib/postgresql/${v}/bin`) : [])];
const find = (name, major) => { for (const d of dirs(major)) { const f = path.join(d, name); if (fsx.existsSync(f)) return f; } return null; };
const majorOfVersion = s => parseInt(String(s).match(/\d+/)[0], 10);
// 備份工具的版本要和資料庫「一樣」：比資料庫舊會失敗，比資料庫新產出的備份檔會有舊版不認得的設定（CI 的 pg_dump 常常比較新）
function tools() {
  const psql = find('psql'); if (!process.env.TEST_PG_ADMIN_URL || !psql) return null;
  const serverMajor = Math.floor(+execFileSync(psql, ['-Atc', 'SHOW server_version_num', process.env.TEST_PG_ADMIN_URL], { encoding: 'utf8' }) / 10000);
  const dump = find('pg_dump', serverMajor), run = find('psql', serverMajor);
  if (!dump || !run || majorOfVersion(execFileSync(dump, ['--version'], { encoding: 'utf8' })) !== serverMajor) { console.warn(`略過還原演練：找不到版本 ${serverMajor} 的 pg_dump 與 psql`); return null; }
  return { dump, psql: run };
}
const T = (() => { try { return tools(); } catch (e) { console.warn('略過還原演練：' + e.message); return null; } })();
const drill = T ? test : test.skip;

async function populate(db) {
  await seed(db);
  const app = createApp({ db, verifyGoogle: async () => ({}), config: { sessionSecret: 'test-secret-test-secret-test-secret-00', devLogin: true } }), hr = request.agent(app);
  await hr.post('/auth/dev-login').send({ email: 'hr@example.test' });
  const row = { empNo: 'J020003', name: '示範員工甲', early: false, regMin: 6000, trWd: 1200, ot: Array(14).fill(0), aa05: 0, aa06: 0, aa11: 0, aaFixed: 0, rural: 0, intro: 0, open: 0, other: 0, short: 0, labor: 600, health: 400, pension: 0, otherDed: 0, refRate: null };
  await hr.post('/api/pay/hourly/rows').send({ month: '2026-10', mode: 'replace', rows: [row] });
  await hr.post('/api/pay/hourly/publish').send({ month: '2026-10' });
  await hr.post('/api/pay/salary/entries').send({ empNo: 'J020003', kind: 'hire', effectiveFrom: '2024-01-01', baseSalary: 30000, professionalAllowance: 2000, reason: '到職定薪' });
}

describe('restore drill', () => {
  drill('a dump restored into a new database verifies; tampering with a payslip or losing a trigger is caught', async () => {
    const A = await tempDatabase(process.env.TEST_PG_ADMIN_URL), B = await tempDatabase(process.env.TEST_PG_ADMIN_URL);
    const dbA = await createDb({ url: A.url }); await populate(dbA);
    const file = path.join(os.tmpdir(), `restore-drill-${process.pid}.sql`); let pool = null, c = null;
    try {
      execFileSync(T.dump, ['--no-owner', '--no-privileges', '--format=plain', '--file', file, A.url], { stdio: 'pipe' });            // 備份
      execFileSync(T.psql, ['-v', 'ON_ERROR_STOP=1', '-q', '-f', file, B.url], { stdio: 'pipe' });                                          // 還原到新的資料庫
      pool = new Pool({ connectionString: B.url, max: 1 }); c = await pool.connect();
      const ok = await verify(c, { maxAgeHours: 1 });
      expect(ok.lines.filter(l => !l.ok)).toEqual([]); expect(ok.ok).toBe(true);
      expect(ok.counts).toMatchObject({ pay_slips: 1, pay_salary_entries: 1 }); expect(ok.counts.employees).toBe((await dbA.query('SELECT count(*)::int AS n FROM employees')).rows[0].n);
      expect(ok.lines.map(l => l.text).join('\n')).toContain('提醒：有');                                                                        // 示範員工會被提醒
      expect((await verify(c, { maxAgeHours: 0 })).ok).toBe(false);                                                                                // 資料比上限舊就失敗（演練時用來檢查備份新不新）
      await c.query("UPDATE pay_slips SET slip = jsonb_set(slip, '{slip,net}', '1')");                                                              // 弄壞一張薪資單
      let r = await verify(c); expect(r.ok).toBe(false); expect(r.lines.find(l => !l.ok).text).toContain('數字對不起來');
      await c.query('DROP TRIGGER pay_salary_no_change ON pay_salary_entries');                                                                    // 拿掉防竄改
      r = await verify(c); expect(r.lines.filter(l => !l.ok).map(l => l.text).join()).toContain('pay_salary_no_change');
    } finally { fs.rmSync(file, { force: true }); if (c) c.release(); if (pool) await pool.end(); await dbA.close(); await A.drop(); await B.drop(); }   // 測試失敗也要先關連線才刪得掉資料庫，不然會卡住
  }, 60000);
});
