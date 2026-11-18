/** 月薪制薪資資料：生效日精確到日、只能新增（資料庫也擋）、更正新增一筆並寫原因、匯入整份一起成功、權限與稽核。 */
const request = require('supertest');
const { createDb } = require('../server/db');
const { createApp } = require('../server/app');
const { seed } = require('../server/seed');
const E = require('../server/salary-engine');

describe('engine', () => {
  const en = [{ id: 1, effectiveFrom: '2025-01-01', base: 30000, allowance: 2000 }, { id: 2, effectiveFrom: '2026-10-16', base: 32000, allowance: 2500 }, { id: 3, effectiveFrom: '2026-10-16', base: 32500, allowance: 2500 }];
  test('the latest effective date wins; on the same date the newest entry (a correction) wins; before any entry there is nothing', () => {
    expect([E.salaryOn(en, '2026-10-15').base, E.salaryOn(en, '2026-10-16').base, E.salaryOn(en, '2030-01-01').base]).toEqual([30000, 32500, 32500]);
    expect(E.salaryOn(en, '2024-12-31')).toBeNull(); expect(E.salaryOn([], '2026-10-01')).toBeNull();
    expect(E.salaryOn([...en].reverse(), '2026-10-16').id).toBe(3);                                         // 順序不影響
  });
  test('a month is split at the raise date by whole days', () => {
    const seg = E.segmentsForMonth(en, '2026-10');
    expect(seg).toEqual([{ from: '2026-10-01', to: '2026-10-15', days: 15, base: 30000, allowance: 2000 }, { from: '2026-10-16', to: '2026-10-31', days: 16, base: 32500, allowance: 2500 }]);
    expect(E.segmentsForMonth(en, '2026-11')).toHaveLength(1);
    expect(E.segmentsForMonth(en, '2024-12')).toEqual([{ from: '2024-12-01', to: '2024-12-31', days: 31, base: null, allowance: null }]);
    expect(E.segmentsForMonth(en, '2028-02')[0].days).toBe(29);                                              // 閏年
    expect(E.segmentsForMonth([{ id: 1, effectiveFrom: '2026-10-01', base: 1, allowance: 0 }], '2026-10')).toHaveLength(1);   // 月初生效：不分段
  });
  test('dates must be real calendar dates', () => { expect(['2026-02-29', '2026-13-01', '2026-1-1', 'x', ''].map(E.isValidDate)).toEqual([false, false, false, false, false]); expect(E.isValidDate('2028-02-29')).toBe(true); });
});

let db, app;
beforeAll(async () => {
  db = await createDb(); await seed(db);
  app = createApp({ db, verifyGoogle: async () => ({}), config: { sessionSecret: 'test-secret-test-secret-test-secret-00', devLogin: true } });
});
afterAll(async () => { await db.close(); });
const as = async email => { const a = request.agent(app); expect((await a.post('/auth/dev-login').send({ email })).status).toBe(200); return a; };
const U = '/api/pay/salary';

describe('permissions', () => {
  test('HR changes; managers and the boss view; administrators and employees see nothing; refusals are audited', async () => {
    const hr = await as('hr@example.test'), mgr = await as('manager@example.test'), adm = await as('admin@example.test'), emp = await as('a@example.test');
    const body = { empNo: 'J020003', kind: 'hire', effectiveFrom: '2024-01-01', baseSalary: 30000, professionalAllowance: 2000, reason: '到職定薪' };
    expect((await mgr.post(U + '/entries').send(body)).status).toBe(403);
    expect((await emp.post(U + '/entries').send(body)).status).toBe(403);
    expect((await hr.post(U + '/entries').send(body)).status).toBe(201);
    expect((await mgr.get(U + '/')).status).toBe(200);
    expect((await adm.get(U + '/')).status).toBe(403); expect((await emp.get(U + '/')).status).toBe(403);
    expect((await emp.get(U + '/history/J020003')).status).toBe(403); expect((await mgr.post(U + '/import').send({ rows: [], reason: 'x' })).status).toBe(403);
    expect((await db.query("SELECT count(*)::int AS n FROM audit_log WHERE action='denied' AND target LIKE '/api/pay/salary%'")).rows[0].n).toBeGreaterThanOrEqual(5);
  });
});

describe('entries', () => {
  test('list as of a date, history, segments; people without an entry are listed too', async () => {
    const hr = await as('hr@example.test');
    expect((await hr.post(U + '/entries').send({ empNo: 'J020003', kind: 'raise', effectiveFrom: '2026-10-16', baseSalary: 32000, professionalAllowance: 2500, reason: '年度調薪' })).status).toBe(201);
    const at = async d => (await hr.get(U + '/?asOf=' + d)).body, row = (b, id) => b.people.find(p => p.empNo === id);
    expect(row(await at('2026-10-15'), 'J020003')).toMatchObject({ base: 30000, allowance: 2000, total: 32000, effectiveFrom: '2024-01-01' });
    expect(row(await at('2026-10-16'), 'J020003')).toMatchObject({ base: 32000, allowance: 2500, total: 34500 });
    const b = await at('2026-10-16'); expect(row(b, 'J020001')).toMatchObject({ hasEntry: false, base: null }); expect(b.missing).toBeGreaterThanOrEqual(3);
    expect((await hr.get(U + '/?asOf=2026-02-30')).status).toBe(400);
    const h = (await hr.get(U + '/history/J020003')).body;
    expect(h.entries.map(e => [e.kind, e.effectiveFrom, e.total])).toEqual([['hire', '2024-01-01', 32000], ['raise', '2026-10-16', 34500]]);
    expect(h.entries[1]).toMatchObject({ reason: '年度調薪', createdBy: '示範人資' });
    expect((await hr.get(U + '/segments/J020003?month=2026-10')).body.segments.map(s => [s.days, s.base])).toEqual([[15, 30000], [16, 32000]]);
    expect((await hr.get(U + '/segments/J020003?month=2026-13')).status).toBe(400);
    expect((await hr.get(U + '/history/NOPE')).status).toBe(404);
  });

  test('a mistake is corrected by a new entry with a reason; the same effective date uses the newest entry; the history is never changed', async () => {
    const hr = await as('hr@example.test');
    const hist = async () => (await hr.get(U + '/history/J020003')).body.entries, raise = (await hist()).find(e => e.kind === 'raise');
    const bad = b => hr.post(U + '/entries').send({ empNo: 'J020003', kind: 'correction', effectiveFrom: '2026-10-16', baseSalary: 32500, professionalAllowance: 2500, correctsId: raise.id, reason: '打錯底薪', ...b });
    expect((await bad({ reason: '' })).body.error).toBe('reason_required');
    expect((await bad({ correctsId: null })).body.error).toBe('corrects_required');
    expect((await bad({ effectiveFrom: '2026-10-17' })).body.error).toBe('correction_date_mismatch');
    expect((await bad({ empNo: 'J020001' })).body.error).toBe('corrects_required');                           // 不能更正別人的
    expect((await hr.post(U + '/entries').send({ empNo: 'J020003', kind: 'raise', effectiveFrom: '2026-11-01', baseSalary: 1, correctsId: raise.id, reason: '多寫' })).body.error).toBe('corrects_only_for_correction');
    expect((await bad({})).status).toBe(201);
    const after = await hist(); expect(after).toHaveLength(3); expect(after[2]).toMatchObject({ kind: 'correction', correctsId: raise.id, reason: '打錯底薪' });
    expect(after[1]).toEqual(raise);                                                                         // 舊的那一筆沒動
    expect((await hr.get(U + '/?asOf=2026-10-20')).body.people.find(p => p.empNo === 'J020003').base).toBe(32500);
  });

  test('the database itself refuses to change or delete an entry', async () => {
    await expect(db.query('UPDATE pay_salary_entries SET base_salary = 1')).rejects.toThrow(/append-only/);
    await expect(db.query('DELETE FROM pay_salary_entries')).rejects.toThrow(/append-only/);
    expect((await db.query('SELECT count(*)::int AS n FROM pay_salary_entries')).rows[0].n).toBeGreaterThanOrEqual(3);
  });

  test('bad input is refused; warnings for pay below the minimum wage and a date before the hire date', async () => {
    const hr = await as('hr@example.test'), post = b => hr.post(U + '/entries').send({ empNo: 'J020002', kind: 'hire', effectiveFrom: '2025-06-01', baseSalary: 30000, professionalAllowance: 0, reason: '到職定薪', ...b });
    expect((await post({ empNo: 'bad id' })).body.error).toBe('bad_emp_no'); expect((await post({ kind: 'weird' })).body.error).toBe('bad_kind');
    expect((await post({ effectiveFrom: '2025-02-30' })).body.error).toBe('bad_date'); expect((await post({ baseSalary: -1 })).body.error).toBe('bad_amount');
    expect((await post({ baseSalary: 'abc' })).body.error).toBe('bad_amount'); expect((await post({ baseSalary: '' })).body.error).toBe('bad_amount');
    expect((await post({ empNo: 'NOPE' })).status).toBe(404);
    const w = await post({ baseSalary: 25000, effectiveFrom: '2020-01-01' });                                    // 示範人資 2023-01-01 到職
    expect(w.status).toBe(201); expect(w.body.warnings.sort()).toEqual(['before_hire', 'below_minimum']);
    expect((await hr.get(U + '/?asOf=2026-10-01')).body.people.find(p => p.empNo === 'J020002').warnings.sort()).toEqual(['before_hire', 'below_minimum']);   // 列表也帶警告，直到有人新增更正
  });
});

describe('template import', () => {
  test('all rows succeed together; rows equal to the current amount are skipped; unknown numbers refuse the whole file', async () => {
    const hr = await as('hr@example.test'), count = async () => (await db.query('SELECT count(*)::int AS n FROM pay_salary_entries')).rows[0].n, before = await count();
    const rows = [{ empNo: 'J020001', effectiveFrom: '2026-01-01', baseSalary: 60000, professionalAllowance: 8000 }, { empNo: 'J020004', effectiveFrom: '2026-01-01', baseSalary: 34000, professionalAllowance: 1000 }];
    expect((await hr.post(U + '/import').send({ rows: [...rows, { empNo: 'ZZ999', effectiveFrom: '2026-01-01', baseSalary: 1 }], reason: '2026 年度調薪' })).body).toEqual({ error: 'unknown_employees', empNos: ['ZZ999'] });
    expect(await count()).toBe(before);                                                                      // 什麼都沒寫
    const ok = await hr.post(U + '/import').send({ rows, reason: '2026 年度調薪' });
    expect(ok.status).toBe(201); expect(ok.body).toMatchObject({ added: 2, unchanged: 0 });
    const again = await hr.post(U + '/import').send({ rows, reason: '重複匯入' });
    expect(again.body).toMatchObject({ added: 0, unchanged: 2 });                                            // 一樣的不再新增
    expect(await count()).toBe(before + 2);
    const h = (await hr.get(U + '/history/J020001')).body.entries; expect(h[h.length - 1]).toMatchObject({ kind: 'import', reason: '2026 年度調薪', total: 68000 });
  });
  test('bad rows refuse the whole file with the row named', async () => {
    const hr = await as('hr@example.test'), post = (rows, reason = '匯入') => hr.post(U + '/import').send({ rows, reason }), ok = { empNo: 'J020001', effectiveFrom: '2027-01-01', baseSalary: 61000, professionalAllowance: 0 };
    expect((await post([ok], '')).body.error).toBe('reason_required'); expect((await post([])).body.error).toBe('bad_rows');
    expect((await post([ok, { ...ok, effectiveFrom: '2027-02-30' }])).body).toMatchObject({ error: 'bad_date', empNo: 'J020001' });
    expect((await post([ok, { ...ok, baseSalary: 'x' }])).body.error).toBe('bad_amount'); expect((await post([ok, { ...ok }])).body.error).toBe('duplicate_row');
    expect((await post([ok, { ...ok, empNo: 'bad id!', effectiveFrom: '2027-03-01' }])).body.error).toBe('bad_emp_no');
    expect((await hr.get(U + '/history/J020001')).body.entries.some(e => e.effectiveFrom === '2027-01-01')).toBe(false);   // 沒有任何一列被寫入
    expect((await db.query("SELECT count(*)::int AS n FROM audit_log WHERE action IN ('pay_salary_add','pay_salary_import','pay_salary_list','pay_salary_history')")).rows[0].n).toBeGreaterThanOrEqual(5);
    const audit = (await db.query("SELECT detail FROM audit_log WHERE action='pay_salary_add' LIMIT 1")).rows[0].detail; expect(JSON.stringify(audit)).not.toMatch(/32000|30000/);   // 稽核紀錄不記金額
  });
});
