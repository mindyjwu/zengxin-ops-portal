/** 拆帳制（後端）：計算引擎、規則驗證與版本、與 /api/svc/pay 一致、輸入與代扣、對不到員編的處理、方案、發布鎖定、薪資單、員工看自己的。 */
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const { createDb } = require('../server/db');
const { createApp } = require('../server/app');
const { seed } = require('../server/seed');
const S = require('../server/split-engine');

const win = {}; new Function('window', fs.readFileSync(path.resolve(__dirname, '../web/svc-parse.js'), 'utf8'))(win);
const { svcAggregate, toPayload } = win.SvcParse;
const HEAD = ['案號', '服務項目代碼', '服務項目類別', '項目服務次數', '居服員姓名', '服務日期', '服務時間長度(分)', '項目單價', '加班類型', '居住(區)', '服務單位', '服務狀態'];
const ROWS = [HEAD,
  ['T-1', 'BA07', '協助沐浴及洗頭', '1', '測試員甲', '2026-10-05', '60', '325', '正常班', '竹北市', '機構一', '已簽退'],
  ['T-2', 'BA07', '協助沐浴及洗頭', '1', '測試員甲', '2026-10-06', '60', '325', '國定假日', '五峰鄉', '機構一', '已簽退'],
  ['T-3', 'BA20', '陪伴服務', '2', '測試員乙', '2026-10-07', '30', '175', '正常班', '竹北市', '機構二', '已簽退'],
  ['T-4', 'XX99', '未知項目', '1', '測試員乙', '2026-10-08', '30', '100', '正常班', '竹北市', '機構二', '已簽退'],
  ['T-5', 'BA20', '陪伴服務', '1', '外部居服員', '2026-10-09', '30', '175', '正常班', '竹北市', '機構二', '已簽退']];

describe('engine', () => {
  const cfg = S.DEFAULT_CONFIG, ba07 = { code: 'BA07', name: '協助沐浴及洗頭' };
  test('weekday uses 計薪, holidays use 假日總薪, plan B uses its own columns', () => {
    const a = S.pay(cfg, { items: [{ ...ba07, n: 2, nh: 1, amount: 0 }], plan: 'A' }), rate = cfg.rates.find(x => x.code === 'BA07');
    expect(a.itemPay).toBe(Math.round(1 * rate.A + 1 * rate.hA)); expect(a.lines[0]).toMatchObject({ nWeekday: 1, nHoliday: 1, price: rate.A, holidayPrice: rate.hA });
    expect(S.pay(cfg, { items: [{ ...ba07, n: 2, nh: 1, amount: 0 }], plan: 'B' }).itemPay).toBe(Math.round(1 * rate.B + 1 * rate.hB));
    expect(S.pay(cfg, { items: [{ ...ba07, n: 0, nh: 0, amount: 0 }] }).itemPay).toBe(0);                       // 次數 0 不計
  });
  test('bonus brackets, remote allowance, and unknown codes block publishing', () => {
    /* 業績獎金依「拆帳薪資累積金額」（11/25 會議確認）；用每次 1 元的測試給付項，次數就等於拆帳薪資。服務金額故意給一個超大的數字，證明不再被採用 */
    const cfgT = { ...cfg, rates: [{ code: 'T1', name: '測試項目', price: 1, priceN: 1, A: 1, B: 1, hA: 1, hB: 1, lead: 0 }] };
    const b = a => S.pay(cfgT, { items: [{ code: 'T1', name: '測試項目', n: a, nh: 0 }], billed: 999999 }).bonus;
    expect([b(19999), b(20000), b(29999), b(30000), b(49999), b(50000), b(100000), b(100001), b(0)]).toEqual([0, 1000, 1000, 3000, 4000, 5000, 5000, 5000, 0]);
    expect(S.pay(cfg, { items: [], remoteCases: 3 }).remote).toBe(1800);
    const u = S.pay(cfg, { items: [{ code: 'XX99', name: '未知', n: 2, nh: 0 }] });
    expect(u.unpaid).toBe(2); expect(u.warn).toEqual([expect.objectContaining({ code: 'unpaid_codes', crit: true })]);
  });
  test('extras are added or deducted by the rule, and a negative net is a serious warning', () => {
    const r = S.pay(cfg, { items: [], extras: { transport10: 300, trainee: 100, labor: 600, liability: 50 } });
    expect([r.A, r.C, r.net]).toEqual([400, 650, -250]); expect(r.warn.map(w => w.code)).toContain('negative_net');
    const flipped = JSON.parse(JSON.stringify(cfg)); flipped.extras.find(e => e.k === 'trainee').kind = 'deduct';
    expect(S.pay(flipped, { items: [], extras: { trainee: 100 } })).toMatchObject({ A: 0, C: 100 });
  });
  test('config validation', () => {
    const copy = () => JSON.parse(JSON.stringify(cfg)), bad = f => { const c = copy(); f(c); return S.validateConfig(c).error; };
    expect(S.validateConfig(copy()).config.rates).toHaveLength(cfg.rates.length);
    expect(bad(c => { c.rates[0].A = -1; })).toBe('bad_config');
    expect(bad(c => { c.rates.push({ ...c.rates[0] }); })).toBe('bad_config');                                  // 碼別與名稱都重複
    expect(bad(c => { c.bonus[1][0] = 100; })).toBe('bad_config');                                              // 區間要由小到大、不重疊
    expect(bad(c => { c.remote.allow = 'x'; })).toBe('bad_config');
    expect(bad(c => { c.extras[0].kind = 'weird'; })).toBe('bad_config');
    expect(bad(c => { c.extras.pop(); })).toBe('bad_config');
    const c = copy(); c.extras[3].label = '改名'; expect(S.validateConfig(c).config.extras[3].label).toBe('見習');    // 代碼與名稱固定
  });
});

let db, app;
beforeAll(async () => {
  db = await createDb(); await seed(db);
  for (const [id, name, email, role] of [['J020022', '測試員甲', 'jia@example.test', 'hca'], ['J020023', '測試員乙', 'yi@example.test', 'driver']])
    await db.query("INSERT INTO employees (id,name,email,unit_id,role) VALUES ($1,$2,$3,'J02',$4)", [id, name, email, role]);
  app = createApp({ db, verifyGoogle: async () => ({}), config: { sessionSecret: 'test-secret-test-secret-test-secret-00', devLogin: true } });
});
afterAll(async () => { await db.close(); });
const as = async email => { const a = request.agent(app); expect((await a.post('/auth/dev-login').send({ email })).status).toBe(200); return a; };
const U = '/api/pay/split';
const importSvc = async rows => { const g = svcAggregate(rows); expect(g.fatal).toBeUndefined(); const mgr = await as('manager@example.test'); expect((await mgr.post('/api/svc/imports').send(toPayload(g, 'oct.csv'))).status).toBe(201); };

describe('results from the 仁寶 import', () => {
  test('match the old draft endpoint per person, plan follows the role, unmatched workers are listed and block publishing', async () => {
    await importSvc(ROWS);
    const hr = await as('hr@example.test'), mgr = await as('manager@example.test');
    const res = (await hr.get(U + '/results?month=2026-10')).body, by = id => res.people.find(p => p.empNo === id);
    expect(res.people.map(p => p.empNo)).toEqual(['J020022', 'J020023']);
    const oldA = (await mgr.get('/api/svc/pay?month=2026-10&plan=A')).body.workers, oldB = (await mgr.get('/api/svc/pay?month=2026-10&plan=B')).body.workers;
    const w = (list, n) => list.find(x => x.worker === n);
    expect(by('J020022').result).toMatchObject({ plan: 'A', planSource: 'default', itemPay: Math.round(w(oldA, '測試員甲').itemPay), bonus: w(oldA, '測試員甲').bonus, remote: w(oldA, '測試員甲').remoteCases * 600 });
    expect(by('J020023').result).toMatchObject({ plan: 'B', planSource: 'role', itemPay: Math.round(w(oldB, '測試員乙').itemPay), unpaid: 1 });   // 司機身分預設方案 B
    expect(by('J020023').result.warn.map(x => x.code)).toContain('unpaid_codes');
    expect(res.unmatched).toEqual([expect.objectContaining({ worker: '外部居服員', status: 'unmatched' })]);
    expect(res.totals.A).toBe(res.people.reduce((a, p) => a + p.result.A, 0));
    const blocked = await hr.post(U + '/publish').send({ month: '2026-10' });
    expect(blocked.status).toBe(409);
    expect(blocked.body.people.map(p => p.name)).toEqual(expect.arrayContaining(['測試員乙', '外部居服員']));        // 碼別不在給付表、對不到員編
  });

  test('assigning an employee number (shared name map) brings the worker in; a plan override wins over the role', async () => {
    const hr = await as('hr@example.test');
    expect((await hr.put('/api/pay/hourly/name-map').send({ worker: '外部居服員', empNo: 'OX0300' })).status).toBe(200);
    expect((await hr.post(U + '/rows').send({ month: '2026-10', mode: 'replace', rows: [{ empNo: 'J020023', name: '測試員乙', plan: 'A', extras: { transport10: 300 } }, { empNo: 'OX0300', name: '外部居服員', extras: {} }] })).status).toBe(201);
    const res = (await hr.get(U + '/results?month=2026-10')).body, by = id => res.people.find(p => p.empNo === id);
    expect(res.unmatched).toEqual([]);
    expect(by('J020023').result).toMatchObject({ plan: 'A', planSource: 'input' }); expect(by('J020023').result.adds).toEqual([{ k: 'transport10', item: '交通津貼（10 公里）', amount: 300 }]);
    expect(by('OX0300')).toMatchObject({ onRoster: false, workers: ['外部居服員'] }); expect(by('OX0300').result.itemPay).toBeGreaterThan(0);
  });

  test('deductions update only those four items, create rows only for known people, and bad input is refused', async () => {
    const hr = await as('hr@example.test');
    const r = await hr.put(U + '/deductions').send({ month: '2026-10', rows: [{ empNo: 'J020023', labor: 600, health: 400, pension: 0, otherDed: 50 }, { empNo: 'J020022', labor: 700 }, { empNo: 'ZZ999', labor: 1 }] });
    expect(r.body).toEqual({ updated: 2, missing: ['ZZ999'] });                                                    // J020022 沒有輸入列但在名冊裡：新增一列
    const res = (await hr.get(U + '/results?month=2026-10')).body, by = id => res.people.find(p => p.empNo === id);
    expect(by('J020023').result.deducts.map(d => [d.k, d.amount])).toEqual([['labor', 600], ['health', 400], ['otherDed', 50]]);
    expect(by('J020023').extras.transport10).toBe(300);                                                           // 其他項目保留
    expect(by('J020022').result.C).toBe(700);
    const bad = b => hr.post(U + '/rows').send({ month: '2026-08', rows: [b] });
    expect((await bad({ empNo: 'x y' })).body.error).toBe('bad_emp_no'); expect((await bad({ empNo: 'A1', plan: 'C' })).body.error).toBe('bad_plan');
    expect((await bad({ empNo: 'A1', extras: { nope: 1 } })).body.error).toBe('bad_extra'); expect((await bad({ empNo: 'A1', extras: { labor: -5 } })).body.error).toBe('bad_value');
    expect((await hr.put(U + '/deductions').send({ month: '2026-10', rows: [{ empNo: 'J020022', labor: 'abc' }] })).status).toBe(400);
  });

  test('rule versions: from a month on, 見習 can be switched to a deduction; earlier months keep the old rule', async () => {
    const hr = await as('hr@example.test');
    await hr.post(U + '/rows').send({ month: '2026-09', mode: 'replace', rows: [{ empNo: 'J020022', name: '測試員甲', extras: { trainee: 100 } }] });
    await hr.post(U + '/rows').send({ month: '2026-11', mode: 'replace', rows: [{ empNo: 'J020022', name: '測試員甲', extras: { trainee: 100 } }] });
    const cfg = (await hr.get(U + '/rules?month=2026-11')).body.config; cfg.extras.find(e => e.k === 'trainee').kind = 'deduct';
    expect((await hr.put(U + '/rules').send({ effectiveFrom: '2026-11', config: cfg })).status).toBe(201);
    const net = async m => (await hr.get(U + '/results?month=' + m)).body.people[0].result.net;
    expect([await net('2026-09'), await net('2026-11')]).toEqual([100, -100]);
    expect((await hr.put(U + '/rules').send({ effectiveFrom: '2026-11', config: { rates: [] } })).status).toBe(400);
  });
});

describe('permissions, publishing and the payslip', () => {
  test('only HR changes things; managers view; employees see nothing here', async () => {
    const mgr = await as('manager@example.test'), emp = await as('jia@example.test');
    expect((await mgr.get(U + '/results?month=2026-10')).status).toBe(200);
    expect((await mgr.post(U + '/rows').send({ month: '2026-10', rows: [{ empNo: 'A1' }] })).status).toBe(403);
    expect((await mgr.put(U + '/rules').send({ effectiveFrom: '2026-12', config: {} })).status).toBe(403);
    expect((await emp.get(U + '/results?month=2026-10')).status).toBe(403);
    expect((await emp.get(U + '/payslips?month=2026-10')).status).toBe(403);
  });

  test('publish needs acknowledgement, then locks every write; the employee sees their own slip with the service lines', async () => {
    const hr = await as('hr@example.test'), jia = await as('jia@example.test');
    await hr.post(U + '/rows').send({ month: '2026-10', mode: 'replace', rows: [{ empNo: 'J020022', name: '測試員甲', extras: { transport10: 300, labor: 600 } }] });
    await hr.put('/api/pay/hourly/name-map').send({ worker: '外部居服員', empNo: '' });
    const pub = await hr.post(U + '/publish').send({ month: '2026-10', acknowledgeWarnings: true });
    expect(pub.status).toBe(201);
    expect((await hr.post(U + '/rows').send({ month: '2026-10', rows: [{ empNo: 'J020022' }] })).body.error).toBe('month_published');
    expect((await hr.put(U + '/deductions').send({ month: '2026-10', rows: [{ empNo: 'J020022', labor: 1 }] })).status).toBe(409);
    expect((await hr.delete(U + '/rows/2026-10/J020022')).status).toBe(409);
    expect((await hr.get(U + '/months')).body.find(m => m.month === '2026-10')).toMatchObject({ status: 'published', version: 1 });
    const list = (await jia.get('/api/payslips/mine')).body; expect(list.find(x => x.month === '2026-10')).toMatchObject({ kind: 'split', version: 1 });
    const slip = (await jia.get('/api/payslips/mine/2026-10?kind=split')).body.slip;
    expect(slip).toMatchObject({ kind: 'split', empNo: 'J020022', plan: 'A' });
    expect(slip.org).toContain('誠馨');                                                                              // 機構名稱用員工所屬單位，不是牛津
    expect(slip.services.map(s => s.code)).toEqual(['BA07']);
    expect(slip.earnings.map(e => e.item)).toEqual(expect.arrayContaining(['拆帳薪資（服務項目 × 給付表）', '交通津貼（10 公里）']));
    expect(slip.net).toBe(slip.totalA - slip.totalC); expect(slip.hours.total).toBe(2);
    expect((await jia.get('/api/payslips/mine/2026-10')).status).toBe(404);                                      // 預設是時薪制，這個人沒有時薪制薪資單
    expect((await jia.get('/api/payslips/mine/2026-10?kind=bad')).status).toBe(400);
    expect((await hr.post(U + '/reopen').send({ month: '2026-10', reason: '更正交通津貼' })).status).toBe(200);
    expect((await jia.get('/api/payslips/mine/2026-10?kind=split')).status).toBe(404);
    const ev = (await hr.get(U + '/events')).body; expect(ev.map(e => e.action)).toEqual(['reopen', 'publish']);
  });
});
