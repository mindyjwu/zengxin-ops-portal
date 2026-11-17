/** 牛津居家時薪制（後端）：計算引擎、規則驗證與版本、權限、匯入、代扣表、較早到職勾選、稽核。 */
const request = require('supertest');
const { createDb } = require('../server/db');
const { createApp } = require('../server/app');
const { seed } = require('../server/seed');
const E = require('../server/hourly-engine');

const cfg = () => JSON.parse(JSON.stringify(E.DEFAULT_CONFIG));
const blank = o => Object.assign(E.blankRow(), o);
const run = (o, early) => E.pay(E.DEFAULT_CONFIG, blank(o), early);
const ot = m => { const a = Array(14).fill(0); Object.entries(m).forEach(([i, v]) => { a[+i] = v; }); return a; };
const row = (empNo, o = {}) => ({ empNo, name: '示範', early: false, regMin: 0, trWd: 0, trHol: 0, trNh: 0, ot: Array(14).fill(0), aa05: 0, aa06: 0, aa11: 0, aaFixed: 0, rural: 0, intro: 0, open: 0, other: 0, short: 0, labor: 0, health: 0, pension: 0, otherDed: 0, refRate: null, ...o });

describe('engine', () => {
  test('tier by minutes, rounding, AA, transfer, deductions', () => {
    const a = run({ regMin: 6000, trWd: 1200, aa05: 2, aa06: 1, aa11: 4, labor: 600, health: 400 }, true);
    expect([a.rate, a.base, a.transfer, a.aa, a.A, a.C, a.net]).toEqual([210, 21000, 3920, 530, 25450, 1000, 24450]);
    expect([7199, 7200].map(m => run({ regMin: m }, false).rate)).toEqual([210, 230]);              // 119:59 → 210、120:00 → 230
    expect([run({ regMin: 8999 }, true).rate, run({ regMin: 9000 }, true).rate, run({ regMin: 9000 }, false).rate]).toEqual([230, 260, 250]);
    expect(run({ regMin: 7199 }, false).base).toBe(25197);                                            // 25196.5 無條件進位
  });
  test('overtime minutes count toward the tier; segments rounded, total from the unrounded sum', () => {
    const e = run({ regMin: 7000, ot: ot({ 0: 90, 2: 120, 6: 90 }) }, false);
    expect([e.rate, e.judgeMin, e.base, e.segs.map(s => s.amt), e.B, e.net]).toEqual([230, 7300, 26834, [462, 920, 462], 1845, 28679]);
  });
  test('AA07/AA08/AA09 are not part of the add-ons and transfer minutes are not judged', () => {
    expect(Object.keys(E.DEFAULT_CONFIG.aa)).toEqual(['AA05', 'AA06', 'AA11']);
    expect(run({ regMin: 7000, trWd: 6000 }, false).rate).toBe(210);                                  // 轉場不算進判斷工時
  });
  test('warnings: near a boundary, negative net, differs from the sheet rate', () => {
    expect(run({ regMin: 7190 }, false).warn.map(w => w.code)).toContain('near_boundary');
    expect(run({ regMin: 100, labor: 99999 }, false).warn.map(w => w.code)).toContain('negative_net');
    expect(run({ regMin: 7200, refRate: 210 }, false).warn.map(w => w.code)).toContain('rate_differs');
  });
  test('config validation: accepts the default, rejects bad tiers, multipliers and rounding', () => {
    expect(E.validateConfig(cfg()).config.tiers).toEqual(E.DEFAULT_CONFIG.tiers);
    const bad = f => { const c = cfg(); f(c); return E.validateConfig(c).error; };
    expect(bad(c => { c.tiers[1].lt = 100; })).toBe('bad_config');                                   // 級距要由小到大
    expect(bad(c => { c.tiers[2].lt = 200; })).toBe('bad_config');                                   // 最後一列不能有門檻
    expect(bad(c => { c.ot[0].mult = -1; })).toBe('bad_config');
    expect(bad(c => { c.ot.pop(); })).toBe('bad_config');
    expect(bad(c => { c.round.base = 'floor'; })).toBe('bad_config');
    expect(bad(c => { c.aa.AA07 = 5; delete c.aa.AA05; })).toBe('bad_config');
    const c = cfg(); c.ot[0].day = '不能改'; expect(E.validateConfig(c).config.ot[0].day).toBe('平日加班');   // 日別與時段固定
  });
});

let db, app;
beforeAll(async () => {
  db = await createDb(); await seed(db);
  for (const [id, name, email, role] of [['J020020', '老闆', 'boss@example.test', 'boss'], ['J020040', '早到職居服員', 'early@example.test', 'hca']])
    await db.query("INSERT INTO employees (id,name,email,unit_id,role) VALUES ($1,$2,$3,'J02',$4)", [id, name, email, role]);
  app = createApp({ db, verifyGoogle: async () => ({}), config: { sessionSecret: 'test-secret-test-secret-test-secret-00', devLogin: true } });
});
afterAll(async () => { await db.close(); });
const as = async email => { const a = request.agent(app); expect((await a.post('/auth/dev-login').send({ email })).status).toBe(200); return a; };
const U = '/api/pay/hourly';

describe('permissions', () => {
  test('flags in /api/me', async () => {
    expect((await (await as('hr@example.test')).get('/api/me')).body).toMatchObject({ canPayView: true, canPayEdit: true, canPayEarly: true });
    expect((await (await as('manager@example.test')).get('/api/me')).body).toMatchObject({ canPayView: true, canPayEdit: false, canPayEarly: true });
    expect((await (await as('boss@example.test')).get('/api/me')).body).toMatchObject({ canPayView: true, canPayEdit: false, canPayEarly: false });
    expect((await (await as('admin@example.test')).get('/api/me')).body).toMatchObject({ canPayView: false, canPayEdit: false, canPayEarly: false });
    expect((await (await as('a@example.test')).get('/api/me')).body).toMatchObject({ canPayView: false, canPayEdit: false });
  });
  test('only HR changes data; viewers read; others are refused and the refusal is audited', async () => {
    const hr = await as('hr@example.test'), mgr = await as('manager@example.test'), emp = await as('a@example.test'), adm = await as('admin@example.test');
    const body = { month: '2026-10', rows: [row('OXHR001', { regMin: 6000 })] };
    expect((await mgr.post(U + '/rows').send(body)).status).toBe(403);
    expect((await emp.post(U + '/rows').send(body)).status).toBe(403);
    expect((await adm.get(U + '/rules?month=2026-10')).status).toBe(403);
    expect((await mgr.put(U + '/rules').send({ effectiveFrom: '2026-11', config: cfg() })).status).toBe(403);
    expect((await emp.get(U + '/results?month=2026-10')).status).toBe(403);
    expect((await hr.post(U + '/rows').send(body)).status).toBe(201);
    expect((await mgr.get(U + '/results?month=2026-10')).status).toBe(200);
    expect((await db.query("SELECT count(*)::int AS n FROM audit_log WHERE action='denied' AND target LIKE '/api/pay/hourly%'")).rows[0].n).toBeGreaterThanOrEqual(4);
  });
});

describe('import and results', () => {
  test('results use the rules, the roster flag overrides the row flag, and viewing is audited', async () => {
    const hr = await as('hr@example.test');
    const rows = [row('OXHR901', { name: '示範甲', early: true, regMin: 6000, trWd: 1200, aa05: 2, aa06: 1, aa11: 4, labor: 600, health: 400 }),
      row('OXHR905', { regMin: 7000, ot: ot({ 0: 90, 2: 120, 6: 90 }) }), row('J020040', { regMin: 9000 })];
    expect((await hr.post(U + '/rows').send({ month: '2026-10', mode: 'replace', rows })).status).toBe(201);
    let res = (await hr.get(U + '/results?month=2026-10')).body;
    const by = id => res.people.find(p => p.empNo === id);
    expect(by('OXHR901').result).toMatchObject({ rate: 210, base: 21000, transfer: 3920, aa: 530, A: 25450, C: 1000, net: 24450 });
    expect(by('OXHR905').result).toMatchObject({ rate: 230, B: 1845, net: 28679 });
    expect(by('J020040')).toMatchObject({ onRoster: true, result: { rate: 250 } });                  // 名冊裡的人沒勾選：其他人員 250
    expect(by('OXHR901').onRoster).toBe(false);
    expect(res.totals.net).toBe(by('OXHR901').result.net + by('OXHR905').result.net + by('J020040').result.net);
    expect((await hr.put(U + '/early/J020040').send({ early: true })).status).toBe(200);              // 員工資料勾選後同一份輸入算出 260
    res = (await hr.get(U + '/results?month=2026-10')).body; expect(by('J020040').result.rate).toBe(260);
    expect((await db.query("SELECT count(*)::int AS n FROM audit_log WHERE action IN ('pay_hourly_view','pay_rows_import','pay_early_tier')")).rows[0].n).toBeGreaterThanOrEqual(4);
  });
  test('upsert changes only the people sent; replace swaps the whole month; delete works', async () => {
    const hr = await as('hr@example.test');
    await hr.post(U + '/rows').send({ month: '2026-09', mode: 'replace', rows: [row('A1', { regMin: 600 }), row('A2', { regMin: 600 })] });
    await hr.post(U + '/rows').send({ month: '2026-09', rows: [row('A1', { regMin: 1200 }), row('A3', { regMin: 60 })] });
    let res = (await hr.get(U + '/results?month=2026-09')).body;
    expect(res.people.map(p => [p.empNo, p.regMin])).toEqual([['A1', 1200], ['A2', 600], ['A3', 60]]);
    expect((await hr.delete(U + '/rows/2026-09/A2')).status).toBe(200);
    expect((await hr.delete(U + '/rows/2026-09/A2')).status).toBe(404);
    await hr.post(U + '/rows').send({ month: '2026-09', mode: 'replace', rows: [row('B1')] });
    res = (await hr.get(U + '/results?month=2026-09')).body; expect(res.people.map(p => p.empNo)).toEqual(['B1']);
    expect((await hr.get(U + '/months')).body.map(m => m.month)).toEqual(expect.arrayContaining(['2026-09', '2026-10']));
  });
  test('bad input is refused with a reason and nothing is stored', async () => {
    const hr = await as('hr@example.test'), post = b => hr.post(U + '/rows').send(b);
    expect((await post({ month: '10', rows: [row('X')] })).status).toBe(400);
    expect((await post({ month: '2026-08', rows: [] })).status).toBe(400);
    expect((await post({ month: '2026-08', rows: [row('bad id!')] })).body.error).toBe('bad_emp_no');
    expect((await post({ month: '2026-08', rows: [row('X', { regMin: -5 })] })).body.error).toBe('bad_value');
    expect((await post({ month: '2026-08', rows: [{ ...row('X'), ot: [1, 2] }] })).body.error).toBe('bad_ot');
    expect((await post({ month: '2026-08', rows: [row('X'), row('X')] })).body.error).toBe('duplicate_emp_no');
    expect((await post({ month: '2026-08', rows: [row('OK'), row('Y', { labor: 'abc' })] })).status).toBe(400);
    expect((await hr.get(U + '/results?month=2026-08')).status).toBe(404);
  });
  test('deductions update the people in the month and report unknown numbers', async () => {
    const hr = await as('hr@example.test');
    await hr.post(U + '/rows').send({ month: '2026-07', mode: 'replace', rows: [row('D1', { regMin: 6000 })] });
    const r = await hr.put(U + '/deductions').send({ month: '2026-07', rows: [{ empNo: 'D1', labor: 600, health: 400, pension: 100, otherDed: 50 }, { empNo: 'ZZZ', labor: 1 }] });
    expect(r.body).toEqual({ updated: 1, missing: ['ZZZ'] });
    expect((await hr.get(U + '/results?month=2026-07')).body.people[0].result).toMatchObject({ C: 1150, net: 21000 - 1150 });
  });
});

describe('rule versions', () => {
  test('a new version applies from its month on; earlier months keep the earlier rules', async () => {
    const hr = await as('hr@example.test');
    for (const m of ['2026-11', '2026-12']) await hr.post(U + '/rows').send({ month: m, mode: 'replace', rows: [row('V1', { regMin: 6000, trWd: 1200 })] });
    const c = cfg(); c.transferRate = 200;
    expect((await hr.put(U + '/rules').send({ effectiveFrom: '2026-12', config: c })).status).toBe(201);
    const t = async m => (await hr.get(U + '/results?month=' + m)).body.people[0].result.transfer;
    expect([await t('2026-11'), await t('2026-12')]).toEqual([3920, 4000]);                         // 12 月起轉場時薪 200
    const rules = (await hr.get(U + '/rules?month=2026-12')).body;
    expect(rules).toMatchObject({ effectiveFrom: '2026-12', editable: true }); expect(rules.versions).toHaveLength(1);
    expect((await hr.get(U + '/rules?month=2026-11')).body.effectiveFrom).toBeNull();                // 11 月沒有版本：預設值
    expect((await hr.put(U + '/rules').send({ effectiveFrom: '2027-01', config: { tiers: [] } })).status).toBe(400);
    expect((await hr.put(U + '/rules').send({ effectiveFrom: 'bad', config: c })).status).toBe(400);
    expect((await db.query("SELECT count(*)::int AS n FROM audit_log WHERE action='pay_rules_change'")).rows[0].n).toBe(1);
  });
});

describe('early-tier flag permissions', () => {
  test('boss and employees cannot tick it; an unknown person is 404', async () => {
    expect((await (await as('boss@example.test')).put(U + '/early/J020040').send({ early: true })).status).toBe(403);
    expect((await (await as('a@example.test')).put(U + '/early/J020040').send({ early: true })).status).toBe(403);
    expect((await (await as('hr@example.test')).put(U + '/early/NOPE').send({ early: true })).status).toBe(404);
  });
});
