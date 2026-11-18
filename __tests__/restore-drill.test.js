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

const bin = name => { for (const d of (process.env.PATH || '').split(':').concat(fs.existsSync('/usr/lib/postgresql') ? fs.readdirSync('/usr/lib/postgresql').sort().reverse().map(v => `/usr/lib/postgresql/${v}/bin`) : [])) { const f = path.join(d, name); if (fs.existsSync(f)) return f; } return null; };
const have = process.env.TEST_PG_ADMIN_URL && bin('pg_dump') && bin('psql');
const drill = have ? test : test.skip;

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
    // pg_dump 的版本不能比資料庫舊（版本不合會直接失敗）：不合就略過並說明，不要讓別人的環境差異變成假失敗
    const major = v => parseInt(String(v).match(/\d+/)[0], 10), clientMajor = major(execFileSync(bin('pg_dump'), ['--version'], { encoding: 'utf8' }));
    const serverMajor = Math.floor(+execFileSync(bin('psql'), ['-Atc', 'SHOW server_version_num', process.env.TEST_PG_ADMIN_URL], { encoding: 'utf8' }) / 10000);
    if (clientMajor < serverMajor) { console.warn(`略過還原演練：pg_dump ${clientMajor} 比資料庫 ${serverMajor} 舊`); return; }
    const A = await tempDatabase(process.env.TEST_PG_ADMIN_URL), B = await tempDatabase(process.env.TEST_PG_ADMIN_URL);
    const dbA = await createDb({ url: A.url }); await populate(dbA);
    const file = path.join(os.tmpdir(), `restore-drill-${process.pid}.sql`); let pool = null, c = null;
    try {
      execFileSync(bin('pg_dump'), ['--no-owner', '--no-privileges', '--format=plain', '--file', file, A.url], { stdio: 'pipe' });            // 備份
      execFileSync(bin('psql'), ['-v', 'ON_ERROR_STOP=1', '-q', '-f', file, B.url], { stdio: 'pipe' });                                          // 還原到新的資料庫
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
