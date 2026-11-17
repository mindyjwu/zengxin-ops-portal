/** 薪資單：內容、發布並鎖定、退回要寫原因、快照不受之後的規則與勾選影響、員工只能看自己已發布的、稽核。 */
const request = require('supertest');
const { createDb } = require('../server/db');
const { createApp } = require('../server/app');
const { seed } = require('../server/seed');

let db, app;
beforeAll(async () => { db = await createDb(); await seed(db); app = createApp({ db, verifyGoogle: async () => ({}), config: { sessionSecret: 'test-secret-test-secret-test-secret-00', devLogin: true } }); });
afterAll(async () => { await db.close(); });
const as = async email => { const a = request.agent(app); expect((await a.post('/auth/dev-login').send({ email })).status).toBe(200); return a; };
const U = '/api/pay/hourly';
const ot = m => { const a = Array(14).fill(0); Object.entries(m).forEach(([i, v]) => { a[+i] = v; }); return a; };
const row = (empNo, o = {}) => ({ empNo, name: '示範', early: false, regMin: 0, trWd: 0, trHol: 0, trNh: 0, ot: Array(14).fill(0), aa05: 0, aa06: 0, aa11: 0, aaFixed: 0, rural: 0, intro: 0, open: 0, other: 0, short: 0, labor: 0, health: 0, pension: 0, otherDed: 0, refRate: null, ...o });
const load = async (hr, month, rows) => expect((await hr.post(U + '/rows').send({ month, mode: 'replace', rows })).status).toBe(201);

describe('the payslip', () => {
  test('follows the existing layout and the numbers match the calculation', async () => {
    const hr = await as('hr@example.test');
    await load(hr, '2026-10', [row('OXHR901', { name: '示範甲', early: true, regMin: 6000, trWd: 1200, aa05: 2, aa06: 1, aa11: 4, rural: 600, labor: 600, health: 400 }),
      row('OXHR905', { name: '示範戊', regMin: 7000, ot: ot({ 0: 90, 2: 120, 6: 90 }) })]);
    const d = (await hr.get(U + '/payslip?month=2026-10&empNo=OXHR901')).body, s = d.slip;
    expect(d.published).toBe(false);
    expect(s).toMatchObject({ month: '2026-10', empNo: 'OXHR901', name: '示範甲', title: '居服員', rate: 210, totalA: 26050, totalB: 0, totalC: 1000, net: 25050 });
    expect(s.org).toContain('牛津居家長照機構');
    expect(s.earnings.map(e => e.item)).toEqual(['本薪（平日服務總時數 × 時薪）', '轉場費（轉場時數 × 轉場時薪）', 'AA05、AA06、AA11 加給', '偏鄉加給', '介紹費', '開案費', '其他津貼／獎金', '缺工獎勵']);
    expect(s.earnings[0]).toEqual({ item: expect.any(String), minutes: 6000, amount: 21000 });
    expect(s.earnings.reduce((a, e) => a + e.amount, 0)).toBe(s.totalA);                                  // 項目加總＝應發
    expect(s.deductions.reduce((a, e) => a + e.amount, 0)).toBe(s.totalC);
    expect(s.net).toBe(s.totalA + s.totalB - s.totalC);
    expect(s.hours).toEqual({ regular: 100, overtime: 0, total: 100 });
    const o = (await hr.get(U + '/payslip?month=2026-10&empNo=OXHR905')).body.slip;
    expect(o.overtime).toEqual([{ day: '平日加班', band: '第9-10小時', mult: 1.34, minutes: 90, amount: 462 }, { day: '國定假日加班', band: '第0-2小時', mult: 2, minutes: 120, amount: 920 }, { day: '休息日加班', band: '第0-2小時', mult: 1.34, minutes: 90, amount: 462 }]);
    expect(o).toMatchObject({ totalB: 1845, net: 28679 }); expect(o.hours).toEqual({ regular: 116.67, overtime: 5, total: 121.67 });
    expect((await hr.get(U + '/payslip?month=2026-10&empNo=NOPE')).status).toBe(404);
    expect((await hr.get(U + '/payslips?month=2026-10')).body.slips).toHaveLength(2);
  });
});

describe('publish, lock, reopen', () => {
  test('a month with a serious warning needs an explicit acknowledgement; then it is locked', async () => {
    const hr = await as('hr@example.test');
    await load(hr, '2026-09', [row('OXHR911', { regMin: 100, labor: 99999 }), row('J020003', { name: '示範員工甲', regMin: 6000, labor: 600 })]);   // 第一位實發為負數
    const r = await hr.post(U + '/publish').send({ month: '2026-09' });
    expect(r.status).toBe(409); expect(r.body.error).toBe('blocking_warnings'); expect(r.body.people[0]).toMatchObject({ empNo: 'OXHR911', warn: ['實發為負數'] });
    const ok = await hr.post(U + '/publish').send({ month: '2026-09', acknowledgeWarnings: true });
    expect(ok.status).toBe(201); expect(ok.body).toMatchObject({ version: 1, people: 2, acknowledgedWarnings: 1 });
    // 鎖定：輸入、代扣、刪除、算分鐘、再次發布都被擋
    expect((await hr.post(U + '/rows').send({ month: '2026-09', rows: [row('OXHR911')] })).body.error).toBe('month_published');
    expect((await hr.put(U + '/deductions').send({ month: '2026-09', rows: [{ empNo: 'OXHR911', labor: 1 }] })).status).toBe(409);
    expect((await hr.delete(U + '/rows/2026-09/OXHR911')).status).toBe(409);
    expect((await hr.post(U + '/from-svc').send({ month: '2026-09' })).status).toBe(409);
    expect((await hr.post(U + '/publish').send({ month: '2026-09' })).status).toBe(409);
    const res = (await hr.get(U + '/results?month=2026-09')).body;
    expect(res).toMatchObject({ status: 'published', version: 1, editable: false }); expect(res.people).toHaveLength(2);
    expect((await hr.get(U + '/months')).body.find(m => m.month === '2026-09')).toMatchObject({ status: 'published', version: 1 });
  });

  test('reopening needs a reason; the old version is kept; republishing makes version 2', async () => {
    const hr = await as('hr@example.test'), mgr = await as('manager@example.test');
    await load(hr, '2026-08', [row('J020003', { name: '示範員工甲', regMin: 6000 })]);
    expect((await mgr.post(U + '/publish').send({ month: '2026-08' })).status).toBe(403);                  // 管理者只能看
    expect((await hr.post(U + '/publish').send({ month: '2026-08' })).status).toBe(201);
    expect((await hr.post(U + '/reopen').send({ month: '2026-08', reason: '短' })).body.error).toBe('reason_required');
    expect((await mgr.post(U + '/reopen').send({ month: '2026-08', reason: '漏算一位的加班' })).status).toBe(403);
    expect((await hr.post(U + '/reopen').send({ month: '2026-07', reason: '這個月沒發布過' })).body.error).toBe('not_published');
    expect((await hr.post(U + '/reopen').send({ month: '2026-08', reason: '漏算一位的加班' })).status).toBe(200);
    expect((await hr.post(U + '/rows').send({ month: '2026-08', rows: [row('J020003', { name: '示範員工甲', regMin: 6600 })] })).status).toBe(201);   // 退回後可以改
    const v2 = await hr.post(U + '/publish').send({ month: '2026-08' });
    expect(v2.body.version).toBe(2);
    expect((await db.query("SELECT version, (slip->'slip'->>'net')::int AS net FROM pay_slips WHERE kind='oxford_hourly' AND month='2026-08' ORDER BY version")).rows).toEqual([{ version: 1, net: 21000 }, { version: 2, net: 23100 }]);
    const ev = (await hr.get(U + '/events')).body.filter(e => e.month === '2026-08');
    expect(ev.map(e => [e.action, e.version])).toEqual([['publish', 2], ['reopen', 1], ['publish', 1]]); expect(ev[1].reason).toBe('漏算一位的加班');
    const audits = (await db.query("SELECT action FROM audit_log WHERE action IN ('pay_publish','pay_reopen')")).rows.map(r => r.action);
    expect(audits).toEqual(expect.arrayContaining(['pay_publish', 'pay_reopen']));
  });

  test('the published numbers do not move when the rules or the early-tier tick change afterwards', async () => {
    const hr = await as('hr@example.test');
    await load(hr, '2026-06', [row('J020003', { name: '示範員工甲', regMin: 9000, trWd: 1200 })]);
    await hr.post(U + '/publish').send({ month: '2026-06' });
    const before = (await hr.get(U + '/payslip?month=2026-06&empNo=J020003')).body.slip;
    expect(before).toMatchObject({ rate: 250, net: 37500 + 3920 });
    const cfg = (await hr.get(U + '/rules?month=2026-06')).body.config; cfg.transferRate = 300; cfg.tiers[2].other = 270;
    expect((await hr.put(U + '/rules').send({ effectiveFrom: '2026-06', config: cfg })).status).toBe(201);
    expect((await hr.put(U + '/early/J020003').send({ early: true })).status).toBe(200);
    const after = (await hr.get(U + '/payslip?month=2026-06&empNo=J020003')).body.slip;
    expect(after).toEqual(before);                                                                         // 快照不變
    expect((await hr.get(U + '/results?month=2026-06')).body.people[0].result).toMatchObject({ rate: 250 });
    const me = (await (await as('a@example.test')).get('/api/payslips/mine/2026-06')).body.slip;
    expect(me.net).toBe(before.net);
  });
});

describe('employees see only their own published payslips', () => {
  test('own, published only; nobody else; no access to the HR endpoints', async () => {
    const hr = await as('hr@example.test'), a = await as('a@example.test'), admin = await as('admin@example.test');
    await load(hr, '2026-05', [row('J020003', { name: '示範員工甲', regMin: 6000 }), row('J020004', { name: '示範系統管理員', regMin: 3000 })]);
    expect((await a.get('/api/payslips/mine')).body.map(x => x.month)).not.toContain('2026-05');            // 草稿看不到
    expect((await a.get('/api/payslips/mine/2026-05')).status).toBe(404);
    await hr.post(U + '/publish').send({ month: '2026-05' });
    const list = (await a.get('/api/payslips/mine')).body; expect(list.find(x => x.month === '2026-05')).toMatchObject({ version: 1, net: 21000 });
    const mine = (await a.get('/api/payslips/mine/2026-05')).body.slip; expect(mine).toMatchObject({ empNo: 'J020003', net: 21000 });
    expect((await admin.get('/api/payslips/mine/2026-05')).body.slip).toMatchObject({ empNo: 'J020004', net: 10500 });   // 另一個人看到的是自己的
    expect((await a.get(U + '/payslip?month=2026-05&empNo=J020004')).status).toBe(403);
    expect((await a.get(U + '/payslips?month=2026-05')).status).toBe(403);
    expect((await a.post(U + '/publish').send({ month: '2026-05' })).status).toBe(403);
    expect((await a.get('/api/payslips/mine/bad')).status).toBe(400);
    await hr.post(U + '/reopen').send({ month: '2026-05', reason: '更正人工項目' });
    expect((await a.get('/api/payslips/mine/2026-05')).status).toBe(404);                                  // 退回後員工立刻看不到
    expect((await a.get('/api/payslips/mine')).body.map(x => x.month)).not.toContain('2026-05');            // 清單也一樣
    const un = await request(app).get('/api/payslips/mine'); expect(un.status).toBe(401);
    expect((await db.query("SELECT count(*)::int AS n FROM audit_log WHERE action='payslip_view_self'")).rows[0].n).toBeGreaterThanOrEqual(2);
  });
});
