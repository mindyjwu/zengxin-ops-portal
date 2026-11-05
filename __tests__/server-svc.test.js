/** 仁寶匯入與儀表板（後端）：權限、驗證、彙總正確、取代舊資料、員工比對、拆帳計薪與展示版一致。 */
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const { createDb } = require('../server/db');
const { createApp } = require('../server/app');
const { seed } = require('../server/seed');

/* 載入瀏覽器端的解析程式（和網站上實際使用的同一份檔案） */
const win = {}; new Function('window', fs.readFileSync(path.resolve(__dirname, '../web/svc-parse.js'), 'utf8'))(win);
const { svcAggregate, toPayload } = win.SvcParse;

const HEAD = ['案號', '服務項目代碼', '服務項目類別', '項目服務次數', '居服員姓名', '服務日期', '服務時間長度(分)', '項目單價', '加班類型', '居住(區)', '服務單位', '服務狀態'];
const ROWS = [HEAD,
  ['T-1', 'BA07', '協助沐浴及洗頭', '1', '測試員甲', '2026-10-05', '60', '325', '正常班', '竹北市', '機構一', '已簽退'],
  ['T-2', 'BA07', '協助沐浴及洗頭', '1', '測試員甲', '2026-10-06', '60', '325', '國定假日', '五峰鄉', '機構一', '忘簽退'],
  ['T-3', 'BA20', '陪伴服務', '2', '測試員乙', '2026-10-07', '30', '175', '正常班', '竹北市', '機構二', '已簽退'],
  ['T-4', 'XX99', '未知項目', '1', '測試員乙', '2026-10-08', '30', '100', '正常班', '竹北市', '機構二', '服務未遇(新制)'],
  ['T-5', 'BA07', '協助沐浴及洗頭', '0', '測試員乙', '2026-10-09', '0', '325', '正常班', '竹北市', '機構二', '已簽退']];
const payloadOf = (rows, name = 'oct.csv') => { const g = svcAggregate(rows); expect(g.fatal).toBeUndefined(); return { g, p: toPayload(g, name) }; };

let db, app;
beforeAll(async () => {
  db = await createDb(); await seed(db);
  for (const [id, name, email, role] of [['J020020', '老闆', 'boss@example.test', 'boss'], ['J020021', '居服主管', 'homelead@example.test', 'homelead'], ['J020022', '測試員甲', 'jia@example.test', 'employee'], ['J020023', '測試員乙', 'yi1@example.test', 'employee'], ['J020024', '測試員乙', 'yi2@example.test', 'employee']])
    await db.query("INSERT INTO employees (id,name,email,unit_id,role) VALUES ($1,$2,$3,'J02',$4)", [id, name, email, role]);
  app = createApp({ db, verifyGoogle: async () => ({}), config: { sessionSecret: 'test-secret-test-secret-test-secret-00', devLogin: true } });
});
afterAll(async () => { await db.close(); });
const as = async email => { const a = request.agent(app); expect((await a.post('/auth/dev-login').send({ email })).status).toBe(200); return a; };

describe('permissions follow the page permission table', () => {
  test('the page flags in /api/me', async () => {
    expect((await (await as('manager@example.test')).get('/api/me')).body).toMatchObject({ canSvcView: true, canSvcImport: true, canSvcPay: true });
    expect((await (await as('admin@example.test')).get('/api/me')).body).toMatchObject({ canSvcView: true, canSvcImport: false, canSvcPay: false });
    expect((await (await as('hr@example.test')).get('/api/me')).body).toMatchObject({ canSvcView: false, canSvcImport: false, canSvcPay: true });
    expect((await (await as('homelead@example.test')).get('/api/me')).body).toMatchObject({ canSvcView: true, canSvcImport: true, canSvcPay: false });
  });
  test('who may view, import and see pay', async () => {
    const { p } = payloadOf(ROWS);
    for (const e of ['a@example.test', 'hr@example.test']) { const a = await as(e); expect((await a.get('/api/svc/months')).status).toBe(403); expect((await a.post('/api/svc/imports').send(p)).status).toBe(403); }
    const admin = await as('admin@example.test');
    expect((await admin.get('/api/svc/months')).status).toBe(200);                         // 系統管理員可檢視
    expect((await admin.post('/api/svc/imports').send(p)).status).toBe(403);               // 但不能匯入
    expect((await admin.get('/api/svc/pay?month=2026-10')).status).toBe(403);              // 也沒有薪資權限
    expect((await (await as('hr@example.test')).get('/api/svc/pay?month=2026-10')).status).not.toBe(403);   // 人資有薪資權限
    expect((await request(app).get('/api/svc/months')).status).toBe(401);
  });
});

describe('import validation', () => {
  test('bad summaries are refused with a reason; nothing is written', async () => {
    const mgr = await as('manager@example.test'), { p } = payloadOf(ROWS);
    const bad = o => mgr.post('/api/svc/imports').send({ ...p, ...o });
    expect((await mgr.post('/api/svc/imports').send({})).body.error).toBe('bad_summary');
    expect((await bad({ mon: { 'not-a-month': p.mon['2026-10'] } })).status).toBe(400);
    expect((await bad({ mon: { '2026-10': { ...p.mon['2026-10'], min: -5 } } })).status).toBe(400);
    expect((await bad({ who: { x: { byDay: { '2026-10-05': -3 } } } })).status).toBe(400);
    expect((await bad({ who: { x: { byDay: { '2026-09-05': 30 } } } })).status).toBe(400);   // 日期所在的月份不在彙總裡
    const many = {}; for (let i = 0; i < 501; i++) many['員' + i] = { byDay: { '2026-10-05': 1 } };
    expect((await bad({ who: many })).body.why).toBe('too_many_workers');
    expect((await db.query('SELECT count(*)::int AS n FROM svc_month')).rows[0].n).toBe(0);
  });
  test('the tables have no place for client names, ID numbers or case numbers', async () => {
    const c = (await db.query("SELECT column_name FROM information_schema.columns WHERE table_name LIKE 'svc_%'")).rows.map(r => r.column_name);
    for (const bad of ['client_name', 'case_no', 'id_no', 'national_id', 'address', 'phone']) expect(c).not.toContain(bad);
    const { p } = payloadOf(ROWS);
    expect(JSON.stringify(p)).not.toMatch(/T-1|案號/);                                       // 案號不在送出的內容裡
  });
});

describe('import, dashboard and workers', () => {
  let mgr;
  beforeAll(async () => { mgr = await as('manager@example.test'); });
  test('import stores the monthly totals and the dashboard shows them', async () => {
    const { g, p } = payloadOf(ROWS);
    const r = await mgr.post('/api/svc/imports').send(p);
    expect(r.status).toBe(201);
    expect(r.body.months).toEqual(['2026-10']);
    const d = (await mgr.get('/api/svc/dashboard?month=2026-10')).body;
    expect(d).toMatchObject({ cases: g.mon['2026-10'].cases, rows: 5, workers: 2 });
    expect(d.hours).toBeCloseTo(3.0, 5);                                                    // 60 + 60 + 30 + 30 + 0 = 180 分鐘
  });
  test('daily hours, top items, worker buckets, exceptions and the partial-month warning', async () => {
    const d = (await mgr.get('/api/svc/dashboard?month=2026-10')).body;
    expect(d.daily.map(x => x.day)).toEqual(['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09']);
    expect(d.daily.reduce((a, x) => a + x.hours, 0)).toBeCloseTo(d.hours, 5);
    expect(d.topItems[0].name).toBe('協助沐浴及洗頭');
    expect(d.workerBuckets.reduce((a, b) => a + b.workers, 0)).toBeGreaterThan(0);
    expect(d.exceptions).toMatchObject({ noOut: 1, noShow: 1, zero: 1 });
    expect(d.partialMonth).toEqual({ lastDay: '2026-10-09', endOfMonth: '2026-10-31' });  // 資料只到 10/9，不是整個月
    expect((await mgr.get('/api/svc/dashboard?month=2026-09')).status).toBe(404);
    expect((await mgr.get('/api/svc/months')).body[0]).toMatchObject({ month: '2026-10', cases: 5, last_day: '2026-10-09' });
  });
  test('worker hours for a day and its week, and matching to employees (same-name handling)', async () => {
    const w = (await mgr.get('/api/svc/workers?month=2026-10&day=2026-10-06')).body;
    const jia = w.find(x => x.worker === '測試員甲'), yi = w.find(x => x.worker === '測試員乙');
    expect(jia).toMatchObject({ dayHours: 1, weekHours: 2, match: { status: 'matched', id: 'J020022' } });
    expect(yi.match.status).toBe('ambiguous');                                               // 資料庫有兩位同名的「測試員乙」
    await db.query("INSERT INTO employees (id,name,email,unit_id,role) VALUES ('J020025','測試員丙','bing@example.test','J02','employee')");
    const { p } = payloadOf([HEAD, ['T-9', 'BA20', '陪伴服務', '1', '測試員丙2', '2026-11-03', '30', '175', '正常班', '竹北市', '機構一', '已簽退']]);
    await mgr.post('/api/svc/imports').send(p);
    expect((await mgr.get('/api/svc/workers?month=2026-11')).body[0].match.status).toBe('suffix');   // 姓名後加「2」，原名在名單裡
  });
  test('re-importing a month replaces it, and the history keeps both imports', async () => {
    const { p } = payloadOf([HEAD, ['T-1', 'BA20', '陪伴服務', '1', '測試員甲', '2026-10-05', '120', '175', '正常班', '竹北市', '機構一', '已簽退']]);
    expect((await mgr.post('/api/svc/imports').send(p)).status).toBe(201);
    const d = (await mgr.get('/api/svc/dashboard?month=2026-10')).body;
    expect(d.hours).toBeCloseTo(2, 5); expect(d.rows).toBe(1); expect(d.topItems.length).toBe(1);
    expect((await mgr.get('/api/svc/imports')).body.length).toBeGreaterThanOrEqual(3);
    expect((await db.query("SELECT count(*)::int AS n FROM svc_worker_day WHERE month='2026-10'")).rows[0].n).toBe(1);   // 舊的日資料被取代
  });
});

describe('revenue-share pay', () => {
  test('matches the demo site: pay table, weekday/holiday, plans A/B, remote allowance, zero counts, unknown codes', async () => {
    const mgr = await as('manager@example.test');
    await mgr.post('/api/svc/imports').send(payloadOf(ROWS).p);
    const a = (await mgr.get('/api/svc/pay?month=2026-10')).body;
    expect(a.totals.itemPay).toBe(558);                      // 甲 163（平日）+ 195（假日總薪）；乙 100 × 2；次數 0 與未知碼不算
    expect(a.totals.remote).toBe(600);
    expect(a.totals.total).toBe(1158);
    expect(Object.keys(a.unmatchedItems)[0]).toMatch(/XX99/);
    expect((await mgr.get('/api/svc/pay?month=2026-10&plan=B')).body.totals.itemPay).toBe(552);   // B：179 + 179 + 97 × 2
    const hr = await as('hr@example.test');
    expect((await hr.get('/api/svc/pay?month=2026-10')).body.totals.total).toBe(1158);
    expect((await mgr.get('/api/svc/pay?month=bad')).status).toBe(400);
    expect((await mgr.get('/api/svc/pay?month=2025-01')).status).toBe(404);
    expect((await (await as('admin@example.test')).get('/api/audit')).body.map(x => x.action)).toEqual(expect.arrayContaining(['svc_import', 'svc_pay_view', 'denied']));
  });
});
