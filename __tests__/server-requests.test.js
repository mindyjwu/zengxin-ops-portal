/** 請假、加班、補打卡與簽核：資料庫規則、額度、重疊、簽核路徑、權限、補打卡核准後入帳。 */
const request = require('supertest');
const { createDb } = require('../server/db');
const { createApp } = require('../server/app');
const { seed } = require('../server/seed');
const { annualDays } = require('../server/leave-rules');

let db, app;
beforeAll(async () => {
  db = await createDb(); await seed(db);
  await db.query("INSERT INTO employees (id,name,email,unit_id,role,manager_id,hired_at) VALUES ('J020010','員工乙','b@example.test','J02','employee','J020001','2026-06-01')");
  app = createApp({ db, verifyGoogle: async () => ({}), config: { sessionSecret: 'test-secret-test-secret-test-secret-00', devLogin: true } });
});
afterAll(async () => { await db.close(); });
const as = async email => { const a = request.agent(app); expect((await a.post('/auth/dev-login').send({ email })).status).toBe(200); return a; };
const iso = (d, h = 8) => `${d}T${String(h).padStart(2, '0')}:00:00+08:00`;
const leave = (a, type, from, to, hours, extra = {}) => a.post('/api/leave').send({ leaveType: type, start: iso(from), end: iso(to, 17), hours, reason: '測試', ...extra });

describe('database rules (they hold even if the API is bypassed)', () => {
  test('leave types and grouped caps are seeded from the 104 setting', async () => {
    expect((await db.query('SELECT count(*)::int AS n FROM leave_types')).rows[0].n).toBe(21);
    expect((await db.query("SELECT cap_hours::int AS h FROM leave_groups WHERE code='sickgrp'")).rows[0].h).toBe(264);
    expect((await db.query("SELECT count(*)::int AS n FROM leave_types WHERE designated_only")).rows[0].n).toBe(2);
  });
  test('half-hour units, valid periods and statuses are enforced by the database', async () => {
    const r = (await db.query("INSERT INTO requests (kind, emp_id, keep_until) VALUES ('leave','J020003','2031-01-01') RETURNING id")).rows[0].id;
    await expect(db.query("INSERT INTO leave_requests VALUES ($1,'sick','2031-01-02T00:00:00Z','2031-01-03T00:00:00Z',1.3)", [r])).rejects.toThrow();
    await expect(db.query("INSERT INTO leave_requests VALUES ($1,'sick','2031-01-03T00:00:00Z','2031-01-02T00:00:00Z',1)", [r])).rejects.toThrow();
    await expect(db.query("INSERT INTO leave_requests VALUES ($1,'nope','2031-01-02T00:00:00Z','2031-01-03T00:00:00Z',1)", [r])).rejects.toThrow();
    await expect(db.query("UPDATE requests SET status='bogus' WHERE id=$1", [r])).rejects.toThrow();
  });
  test('status can only move along the allowed path, and approvals are append-only', async () => {
    const r = (await db.query("INSERT INTO requests (kind, emp_id, keep_until) VALUES ('leave','J020003','2031-01-01') RETURNING id")).rows[0].id;
    await expect(db.query("UPDATE requests SET status='approved' WHERE id=$1", [r])).rejects.toThrow(/illegal status/);   // 不能跳過簽核
    await db.query("UPDATE requests SET status='countersign' WHERE id=$1", [r]);
    await db.query("UPDATE requests SET status='approved' WHERE id=$1", [r]);
    await expect(db.query("UPDATE requests SET status='pending' WHERE id=$1", [r])).rejects.toThrow(/illegal status/);   // 核准後不能退回待簽
    await db.query("INSERT INTO approvals (request_id, step, action, actor_id) VALUES ($1,'applicant','submit','J020003')", [r]);
    await expect(db.query('UPDATE approvals SET comment=$1 WHERE request_id=$2', ['改寫', r])).rejects.toThrow(/append-only/);
    await expect(db.query('DELETE FROM approvals WHERE request_id=$1', [r])).rejects.toThrow(/append-only/);
  });
});

describe('leave requests', () => {
  test('a valid request is stored as pending with a submit record; bad input is refused', async () => {
    const a = await as('a@example.test');
    const ok = await leave(a, 'personal', '2030-02-04', '2030-02-04', 8);
    expect(ok.status).toBe(201);
    expect(ok.body).toMatchObject({ status: 'pending' });
    expect(ok.body.no).toMatch(/^L\d+$/);
    expect((await a.post('/api/leave').send({ leaveType: 'personal', start: 'x', end: 'y', hours: 8 })).body.error).toBe('bad_period');
    expect((await leave(a, 'personal', '2030-02-05', '2030-02-05', 0)).body.error).toBe('hours_must_be_positive_half_hours');
    expect((await leave(a, 'personal', '2030-02-05', '2030-02-05', 1.3)).status).toBe(400);
    expect((await leave(a, 'personal', '2030-02-05', '2030-02-05', 12)).body.error).toBe('hours_exceed_period');
    expect((await leave(a, 'nonsense', '2030-02-05', '2030-02-05', 4)).body.error).toBe('unknown_leave_type');
    expect((await request(app).post('/api/leave').send({})).status).toBe(401);
  });
  test('designated-staff-only types are refused for everyone else', async () => {
    const a = await as('a@example.test');
    expect((await leave(a, 'indigenous', '2030-03-04', '2030-03-04', 8)).status).toBe(403);
    expect((await a.get('/api/leave/balance')).body.map(x => x.code)).not.toContain('indigenous');
  });
  test('time overlapping an existing request is refused; the next day is fine', async () => {
    const a = await as('a@example.test');
    expect((await leave(a, 'family', '2030-04-08', '2030-04-08', 8)).status).toBe(201);
    expect((await leave(a, 'family', '2030-04-08', '2030-04-08', 4)).body.error).toBe('leave_overlaps');
    expect((await leave(a, 'family', '2030-04-09', '2030-04-09', 4)).status).toBe(201);
  });
  test('quotas: annual follows seniority, event types have a per-event cap, menstrual leave is per month, groups share a cap', async () => {
    const a = await as('a@example.test');
    const days = annualDays('2023-01-01', new Date('2030-06-01T00:00:00Z'));
    const over = await leave(a, 'annual', '2030-06-03', '2030-06-28', days * 8 + 4);
    expect(over.body.error).toBe('quota_exceeded');
    expect(over.body.left).toBe(days * 8);
    expect((await leave(a, 'marriage', '2030-07-01', '2030-07-31', 72)).body.error).toBe('exceeds_per_event_limit');
    expect((await leave(a, 'marriage', '2030-07-01', '2030-07-31', 64)).status).toBe(201);
    expect((await leave(a, 'menstrual', '2030-08-05', '2030-08-05', 8)).status).toBe(201);
    expect((await leave(a, 'menstrual', '2030-08-12', '2030-08-12', 4)).body.error).toBe('quota_exceeded');
    expect((await leave(a, 'menstrual', '2030-09-02', '2030-09-02', 8)).status).toBe(201);   // 下個月重新計
    const b = await as('b@example.test');                                                    // 事假類（事假＋家庭照顧假）合計 112 小時
    expect((await leave(b, 'personal', '2030-10-01', '2030-10-31', 100)).status).toBe(201);
    const grp = await leave(b, 'family', '2030-11-04', '2030-11-04', 8);
    expect(grp.status).toBe(201);
    expect((await leave(b, 'family', '2030-11-05', '2030-11-05', 8)).body.error).toBe('quota_exceeded');   // 100 + 8 + 8 > 112
  });
});

describe('approval flow', () => {
  test('applicant -> direct manager -> HR countersign -> approved, with a full history', async () => {
    const emp = await as('a@example.test'), mgr = await as('manager@example.test'), hr = await as('hr@example.test');
    const id = (await leave(emp, 'personal', '2030-12-02', '2030-12-02', 8)).body.id;
    expect((await mgr.get('/api/requests/inbox')).body.map(x => x.id)).toContain(id);
    expect((await emp.post(`/api/requests/${id}/approve`).send({})).status).toBe(403);       // 不能簽自己的單
    expect((await (await as('b@example.test')).post(`/api/requests/${id}/approve`).send({})).status).toBe(403);   // 一般員工不能簽別人的
    expect((await mgr.post(`/api/requests/${id}/approve`).send({ comment: '同意' })).body.status).toBe('countersign');
    expect((await (await hr.get('/api/requests/inbox')).body.map(x => x.id))).toContain(id);
    expect((await mgr.post(`/api/requests/${id}/approve`).send({})).status).toBe(403);       // 主管關已過，第二關是人資
    expect((await hr.post(`/api/requests/${id}/approve`).send({ comment: '複核' })).body.status).toBe('approved');
    const d = (await emp.get(`/api/requests/${id}`)).body;
    expect(d.status).toBe('approved');
    expect(d.leave_type_name).toBe('事假');                                                  // 畫面顯示中文假別名稱
    expect(d.history.map(h => h.step + ':' + h.action)).toEqual(['applicant:submit', 'manager:approve', 'hr:approve']);
    expect((await hr.post(`/api/requests/${id}/approve`).send({})).status).toBe(409);        // 已核准不能再簽
    expect((await emp.post(`/api/requests/${id}/cancel`).send({})).body.status).toBe('cancelled');   // 未來的請假可以銷假
  });
  test('rejecting needs a reason; the applicant can withdraw; nobody else can', async () => {
    const emp = await as('a@example.test'), mgr = await as('manager@example.test');
    const a = (await leave(emp, 'personal', '2031-01-06', '2031-01-06', 4)).body.id, b = (await leave(emp, 'personal', '2031-01-07', '2031-01-07', 4)).body.id;
    expect((await mgr.post(`/api/requests/${a}/reject`).send({})).body.error).toBe('reject_needs_reason');
    expect((await mgr.post(`/api/requests/${a}/reject`).send({ comment: '人力不足' })).body.status).toBe('rejected');
    expect((await mgr.post(`/api/requests/${b}/withdraw`).send({})).status).toBe(403);
    expect((await emp.post(`/api/requests/${b}/withdraw`).send({})).body.status).toBe('withdrawn');
    expect((await emp.post(`/api/requests/${b}/withdraw`).send({})).status).toBe(409);
    expect((await emp.get(`/api/requests/${a}`)).body.history.pop()).toMatchObject({ action: 'reject', comment: '人力不足' });
  });
  test('nobody can approve their own request, even with approval permissions (HR, manager)', async () => {
    const hr = await as('hr@example.test'), mgr = await as('manager@example.test');
    const own = (await leave(hr, 'personal', '2031-03-03', '2031-03-03', 4)).body.id;
    expect((await hr.post(`/api/requests/${own}/approve`).send({})).status).toBe(403);       // 人資簽自己的主管關
    expect((await mgr.post(`/api/requests/${own}/approve`).send({})).body.status).toBe('countersign');
    expect((await hr.post(`/api/requests/${own}/approve`).send({})).status).toBe(403);       // 人資複核自己的單
    const mine = (await leave(mgr, 'personal', '2031-03-04', '2031-03-04', 4)).body.id;
    expect((await mgr.post(`/api/requests/${mine}/approve`).send({})).status).toBe(403);      // 管理者簽自己的單
  });
  test('a withdrawn or rejected request frees the time again', async () => {
    const emp = await as('a@example.test');
    expect((await leave(emp, 'personal', '2031-01-06', '2031-01-06', 4)).status).toBe(201);   // 上一個測試被駁回的同一天
  });
  test('only the applicant, the chain and company-wide viewers can open a request; the inbox is private', async () => {
    const emp = await as('a@example.test'), other = await as('b@example.test');
    const id = (await leave(emp, 'personal', '2031-02-03', '2031-02-03', 4)).body.id;
    expect((await other.get(`/api/requests/${id}`)).status).toBe(403);
    expect((await other.get('/api/requests/inbox')).body.length).toBe(0);
    expect((await (await as('manager@example.test')).get(`/api/requests/${id}`)).status).toBe(200);
    expect((await emp.get('/api/requests/999999')).status).toBe(404);
    expect((await emp.get('/api/requests')).body.every(x => x.empId === 'J020003')).toBe(true);
  });
});

describe('overtime', () => {
  const ot = (a, date, hours, comp = 'pay', st = '17:00', en = '23:00') => a.post('/api/overtime').send({ workDate: date, startTime: st, endTime: en, hours, comp, reason: '測試' });
  test('valid overtime; invalid choices; the 46-hour monthly cap', async () => {
    const a = await as('b@example.test');
    expect((await ot(a, '2030-05-02', 3)).status).toBe(201);
    expect((await ot(a, '2030-05-03', 2, 'cash')).body.error).toBe('comp_must_be_pay_or_comp');
    expect((await ot(a, '2030-05-03', 13)).body.error).toBe('hours_must_be_half_hours_up_to_12');
    expect((await ot(a, '2030-05-03', 5, 'pay', '17:00', '19:00')).body.error).toBe('hours_exceed_time_range');
    expect((await a.post('/api/overtime').send({ workDate: 'x', startTime: '1', endTime: '2', hours: 1, comp: 'pay' })).body.error).toBe('bad_date_or_time');
    for (const d of ['04', '05', '06']) expect((await ot(a, `2030-05-${d}`, 12, 'pay', '08:00', '20:00')).status).toBe(201);   // 3 + 36 = 39
    const cap = await ot(a, '2030-05-07', 12, 'pay', '08:00', '20:00');                      // 39 + 12 > 46
    expect(cap.status).toBe(422);
    expect(cap.body).toMatchObject({ error: 'monthly_overtime_cap', cap: 46 });
    expect((await ot(a, '2030-06-03', 12, 'pay', '08:00', '20:00')).status).toBe(201);        // 下個月重新計
  });
  test('approved comp-time overtime becomes comp leave balance, and comp leave cannot exceed it', async () => {
    const a = await as('a@example.test'), mgr = await as('manager@example.test'), hr = await as('hr@example.test');
    const o = (await ot(a, '2030-03-02', 4, 'comp', '08:00', '12:00')).body.id;
    expect((await leave(a, 'comp', '2030-03-11', '2030-03-11', 4)).body.error).toBe('quota_exceeded');   // 還沒核准，沒有補休時數
    await mgr.post(`/api/requests/${o}/approve`).send({}); await hr.post(`/api/requests/${o}/approve`).send({});
    expect((await leave(a, 'comp', '2030-03-11', '2030-03-11', 4)).status).toBe(201);
    expect((await leave(a, 'comp', '2030-03-12', '2030-03-12', 0.5)).body.error).toBe('quota_exceeded');   // 4 小時已用完
  });
});

describe('punch correction', () => {
  test('after both approvals the missing punch is added to the punch record, marked as a correction', async () => {
    const emp = await as('a@example.test'), mgr = await as('manager@example.test'), hr = await as('hr@example.test');
    const y = new Date(Date.now() - 86400_000).toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' });
    const id = (await emp.post('/api/punch-fix').send({ fixDate: y, fixTime: '08:55', kind: 'in', reason: '忘記打卡' })).body.id;
    expect((await db.query("SELECT 1 FROM punches WHERE source='fix'")).rows.length).toBe(0);   // 核准前不會出現
    await mgr.post(`/api/requests/${id}/approve`).send({}); await hr.post(`/api/requests/${id}/approve`).send({});
    const p = (await db.query("SELECT emp_id, kind, at, net_kind FROM punches WHERE source='fix'")).rows[0];
    expect(p).toMatchObject({ emp_id: 'J020003', kind: 'in', net_kind: 'fix' });
    expect(new Date(p.at).toISOString()).toBe(new Date(`${y}T08:55:00+08:00`).toISOString());   // 台北時間 08:55
  });
  test('the future and bad inputs are refused', async () => {
    const emp = await as('a@example.test');
    expect((await emp.post('/api/punch-fix').send({ fixDate: '2099-01-01', fixTime: '08:00', kind: 'in' })).body.error).toBe('cannot_fix_the_future');
    expect((await emp.post('/api/punch-fix').send({ fixDate: '2020-01-01', fixTime: '25:00', kind: 'in' })).body.error).toBe('bad_date_or_time');
    expect((await emp.post('/api/punch-fix').send({ fixDate: '2020-01-01', fixTime: '08:00', kind: 'lunch' })).body.error).toBe('bad_kind');
  });
});

describe('audit and balance', () => {
  test('every step is in the audit log, and the balance endpoint shows quotas', async () => {
    const a = await as('admin@example.test');
    const log = (await a.get('/api/audit')).body.map(x => x.action);
    expect(log).toEqual(expect.arrayContaining(['request_submit', 'request_approve', 'request_reject', 'request_withdraw', 'request_cancel', 'denied']));
    const bal = (await (await as('a@example.test')).get('/api/leave/balance')).body;
    const sick = bal.find(x => x.code === 'sick');
    expect(sick.quota).toBe(240);
    expect(bal.find(x => x.code === 'annual').quota).toBeGreaterThan(0);
  });
});
