/** 員工與角色管理、批次匯入、登入頁：權限、員編產生、交易、稽核。 */
const request = require('supertest');
const { createDb } = require('../server/db');
const { createApp } = require('../server/app');
const { seed } = require('../server/seed');
const { parseCsv } = require('../server/employees');

let db, app;
beforeAll(async () => {
  db = await createDb(); await seed(db);
  app = createApp({ db, verifyGoogle: async () => ({ email: 'a@example.test', emailVerified: true }), config: { sessionSecret: 'test-secret-test-secret-test-secret-00', devLogin: true, googleClientId: 'abc.apps.googleusercontent.com' } });
});
afterAll(async () => { await db.close(); });
const as = async email => { const a = request.agent(app); expect((await a.post('/auth/dev-login').send({ email })).status).toBe(200); return a; };

describe('units and schema', () => {
  test('the 9 company and facility codes are loaded and employees have an old-number column', async () => {
    const u = (await db.query('SELECT id FROM units ORDER BY id')).rows.map(r => r.id);
    expect(u).toEqual(['J01', 'J02', 'J03', 'J04', 'O01', 'O02', 'O03', 'O04', 'O05']);
    expect((await db.query("SELECT column_name FROM information_schema.columns WHERE table_name='employees' AND column_name='old_no'")).rows.length).toBe(1);
  });
  test('email is unique regardless of letter case', async () => {
    await expect(db.query("INSERT INTO employees (id,name,email,unit_id,role) VALUES ('J029999','x','A@EXAMPLE.TEST','J02','employee')")).rejects.toThrow();
  });
});

describe('who can do what', () => {
  test('an ordinary employee cannot list or create; HR can list; the login page config is public', async () => {
    const emp = await as('a@example.test'), hr = await as('hr@example.test');
    expect((await emp.get('/api/employees')).status).toBe(403);
    expect((await emp.post('/api/employees').send({ name: 'x', email: 'x@example.test', unitId: 'J02' })).status).toBe(403);
    expect((await hr.get('/api/employees')).body.length).toBeGreaterThanOrEqual(4);
    expect((await request(app).get('/api/employees')).status).toBe(401);
    expect((await request(app).get('/auth/config')).body).toEqual({ googleClientId: 'abc.apps.googleusercontent.com', devLogin: true });
  });
  test('/api/me tells the page what the person may do', async () => {
    expect((await (await as('hr@example.test')).get('/api/me')).body).toMatchObject({ canListEmployees: true, canEditEmployees: true, canChangeRole: false });
    expect((await (await as('manager@example.test')).get('/api/me')).body).toMatchObject({ canChangeRole: true });
    expect((await (await as('a@example.test')).get('/api/me')).body).toMatchObject({ canListEmployees: false, canEditEmployees: false });
  });
});

describe('create and update', () => {
  test('HR creates an employee: the number follows company code + 4-digit serial; roles need the permission', async () => {
    const hr = await as('hr@example.test');
    const r = await hr.post('/api/employees').send({ name: '新人甲', email: 'new1@example.test', unitId: 'J02', hiredAt: '2026-11-01' });
    expect(r.status).toBe(201);
    expect(r.body.id).toBe('J020005');                                   // 已有 J020001–J020004
    expect((await hr.post('/api/employees').send({ name: '新人乙', email: 'new2@example.test', unitId: 'O01' })).body.id).toBe('O010001');
    expect((await hr.post('/api/employees').send({ name: '想當管理者', email: 'sneaky@example.test', unitId: 'J02', role: 'manager' })).status).toBe(403);
    expect((await hr.post('/api/employees').send({ name: '重複', email: 'NEW1@example.test', unitId: 'J02' })).status).toBe(409);
    expect((await hr.post('/api/employees').send({ name: 'x', email: 'bad', unitId: 'J02' })).status).toBe(400);
    expect((await hr.post('/api/employees').send({ name: 'x', email: 'x@example.test', unitId: 'ZZZ' })).status).toBe(400);
    expect((await hr.post('/api/employees').send({ name: 'x', email: 'x@example.test', unitId: 'J02', hiredAt: '11/01' })).status).toBe(400);
    const mgr = await as('manager@example.test');
    expect((await mgr.post('/api/employees').send({ name: '新組長', email: 'lead@example.test', unitId: 'J02', role: 'daydir' })).status).toBe(201);
    expect((await mgr.post('/api/employees').send({ name: 'x', email: 'y@example.test', unitId: 'J02', role: 'nonsense' })).status).toBe(400);
  });
  test('changing a role needs the permission, never your own, and is logged; deactivating works but not for yourself', async () => {
    const hr = await as('hr@example.test'), mgr = await as('manager@example.test');
    expect((await hr.patch('/api/employees/J020003').send({ role: 'manager' })).status).toBe(403);
    expect((await mgr.patch('/api/employees/J020003').send({ role: 'training' })).status).toBe(200);
    expect((await db.query("SELECT role FROM employees WHERE id='J020003'")).rows[0].role).toBe('training');
    expect((await mgr.patch('/api/employees/J020001').send({ role: 'employee' })).body.error).toBe('cannot_change_own_role');
    expect((await hr.patch('/api/employees/J020002').send({ status: 'inactive' })).body.error).toBe('cannot_deactivate_self');
    expect((await hr.patch('/api/employees/J020003').send({ name: '改名後' })).status).toBe(200);
    expect((await hr.patch('/api/employees/NOPE').send({ name: 'x' })).status).toBe(404);
    expect((await hr.patch('/api/employees/J020003').send({})).status).toBe(400);
    await hr.patch('/api/employees/J020005').send({ status: 'inactive' });
    expect((await request(app).post('/auth/dev-login').send({ email: 'new1@example.test' })).status).toBe(403);   // 停用的人不能登入
    const log = (await db.query("SELECT action FROM audit_log WHERE action IN ('employee_create','employee_update','denied')")).rows.map(r => r.action);
    expect(log).toEqual(expect.arrayContaining(['employee_create', 'employee_update', 'denied']));
  });
});

describe('CSV import', () => {
  const head = '員編,姓名,email,單位代號,角色,到職日,舊員編\n';
  test('the CSV parser handles quotes, commas inside quotes, CRLF and a BOM', () => {
    expect(parseCsv('﻿a,"b,c","d ""e"""\r\n1,2,3\r\n')).toEqual([['a', 'b,c', 'd "e"'], ['1', '2', '3']]);
  });
  test('a dry run shows new, update and error rows and writes nothing', async () => {
    const hr = await as('hr@example.test');
    const csv = head + ',匯入一,imp1@example.test,J02,,2026-11-01,CSHR001\n,匯入二,imp2@example.test,O02,,,\n,更新,a@example.test,J02,,,\n,壞列,bad,ZZZ,,,\n,重複,IMP1@example.test,J02,,,\n';
    const r = await hr.post('/api/employees/import').send({ csv });
    expect(r.body.dryRun).toBe(true);
    expect(r.body.counts).toEqual({ new: 2, update: 1, error: 2 });
    expect(r.body.rows.find(x => x.line === 5).errors.join()).toMatch(/email|單位/);
    expect((await db.query("SELECT 1 FROM employees WHERE email='imp1@example.test'")).rows.length).toBe(0);
  });
  test('a commit with any error writes nothing; a clean commit writes everything in one transaction with serial numbers', async () => {
    const hr = await as('hr@example.test');
    expect((await hr.post('/api/employees/import').send({ csv: head + ',好,ok1@example.test,J03,,,\n,壞,bad,J03,,,\n', commit: true })).status).toBe(422);
    expect((await db.query("SELECT 1 FROM employees WHERE email='ok1@example.test'")).rows.length).toBe(0);
    const r = await hr.post('/api/employees/import').send({ csv: head + ',好一,ok1@example.test,J03,,,CSHR010\n,好二,ok2@example.test,J03,,,\n,改名,a@example.test,J02,,,\n', commit: true });
    expect(r.body).toMatchObject({ committed: true, counts: { new: 2, update: 1 } });
    const ids = (await db.query("SELECT id, old_no FROM employees WHERE email IN ('ok1@example.test','ok2@example.test') ORDER BY id")).rows;
    expect(ids.map(x => x.id)).toEqual(['J030001', 'J030002']);
    expect(ids[0].old_no).toBe('CSHR010');
    expect((await db.query("SELECT name FROM employees WHERE email='a@example.test'")).rows[0].name).toBe('改名');
    expect((await db.query("SELECT 1 FROM audit_log WHERE action='employees_import'")).rows.length).toBeGreaterThan(0);
  });
  test('HR cannot assign roles through the import; the manager can; missing columns are reported', async () => {
    const hr = await as('hr@example.test'), mgr = await as('manager@example.test');
    const csv = head + ',主管,boss1@example.test,J02,daydir,,\n';
    expect((await hr.post('/api/employees/import').send({ csv })).body.counts.error).toBe(1);
    const ok = await mgr.post('/api/employees/import').send({ csv, commit: true });
    expect(ok.body.committed).toBe(true);
    expect((await db.query("SELECT role FROM employees WHERE email='boss1@example.test'")).rows[0].role).toBe('daydir');
    expect((await hr.post('/api/employees/import').send({ csv: 'a,b\n1,2\n' })).body.error).toBe('missing_columns');
    expect((await (await as('a@example.test')).post('/api/employees/import').send({ csv })).status).toBe(403);
  });
});

describe('web pages', () => {
  test('the login page is served with the Google script and strict security headers', async () => {
    const r = await request(app).get('/');
    expect(r.status).toBe(200);
    expect(r.text).toContain('https://accounts.google.com/gsi/client');
    expect(r.headers['content-security-policy']).toMatch(/script-src 'self' https:\/\/accounts\.google\.com/);
    expect(r.headers['x-frame-options']).toBe('DENY');
    expect(r.text).not.toMatch(/<script>[^<]/);                          // 沒有行內腳本（CSP 才擋得住注入）
    expect(r.text).not.toMatch(/style="/);                               // 也沒有行內樣式（CSP 的 style-src 才不用放寬）
  });
  test('the admin page and its script are served; files outside the web folder are not', async () => {
    expect((await request(app).get('/admin.html')).status).toBe(200);
    expect((await request(app).get('/admin.js')).status).toBe(200);
    expect((await request(app).get('/..%2fserver%2fdb.js')).status).not.toBe(200);
    expect((await request(app).get('/server/db.js')).status).toBe(404);
  });
});
