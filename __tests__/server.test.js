/**
 * 後端測試：資料庫建表、Google 登入驗證、工作階段、伺服器端權限、打卡、稽核紀錄。
 * 用 PGlite（真正的 PostgreSQL，跑在記憶體裡），所以不需要另外裝資料庫。
 */
const request = require('supertest');
const { createDb } = require('../server/db');
const { createApp } = require('../server/app');
const { makeSession, readSession } = require('../server/auth');
const { seed } = require('../server/seed');
const { roleKeys, can } = require('../server/permissions');

const SECRET = 'test-secret-test-secret-test-secret-00';
let db;

beforeAll(async () => { db = await createDb(); await seed(db); await db.query("INSERT INTO employees (id,name,email,unit_id,role,status) VALUES ('J020009','已停用','gone@example.test','J02','employee','inactive')"); });
afterAll(async () => { await db.close(); });

const mkApp = (over = {}, verifyGoogle) => createApp({ db, verifyGoogle: verifyGoogle || (async () => ({ email: 'a@example.test', emailVerified: true, hd: 'corp.test' })), config: { sessionSecret: SECRET, devLogin: true, ...over } });
const loginAs = async (app, email) => { const a = request.agent(app); const r = await a.post('/auth/dev-login').send({ email }); expect(r.status).toBe(200); return a; };

describe('database', () => {
  test('migrations create the tables and are safe to run twice', async () => {
    const t = (await db.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public'")).rows.map(r => r.table_name);
    for (const n of ['units', 'employees', 'offices', 'punches', 'audit_log', 'schema_migrations']) expect(t).toContain(n);
    const { migrate } = require('../server/db');
    await migrate(db);
    const files = require('fs').readdirSync(require('path').join(__dirname, '../server/migrations')).filter(x => x.endsWith('.sql')).length;
    expect((await db.query('SELECT count(*)::int AS n FROM schema_migrations')).rows[0].n).toBe(files);
  });
  test('a punch cannot be stored for an unknown employee or a bad kind', async () => {
    await expect(db.query("INSERT INTO punches (emp_id,kind,keep_until) VALUES ('NOPE','in','2031-01-01')")).rejects.toThrow();
    await expect(db.query("INSERT INTO punches (emp_id,kind,keep_until) VALUES ('J020003','lunch','2031-01-01')")).rejects.toThrow();
  });
});

describe('sessions', () => {
  test('a signed session is read back; a tampered or expired one is rejected', () => {
    const tok = makeSession('J020003', SECRET);
    expect(readSession(tok, SECRET).sub).toBe('J020003');
    expect(readSession(tok.slice(0, -2) + 'xx', SECRET)).toBeNull();
    expect(readSession(makeSession('J020003', 'another-secret-another-secret-0000'), SECRET)).toBeNull();
    expect(readSession(makeSession('J020003', SECRET, 60, Date.now() - 3600_000), SECRET)).toBeNull();
    expect(readSession('garbage', SECRET)).toBeNull();
  });
});

describe('login', () => {
  test('health check is public; the API needs a login', async () => {
    const app = mkApp();
    expect((await request(app).get('/healthz')).body.ok).toBe(true);
    expect((await request(app).get('/api/me')).status).toBe(401);
  });
  test('Google login: verified email in the allowed domain that belongs to an employee', async () => {
    const app = mkApp({ allowedDomain: 'corp.test' });
    const a = request.agent(app);
    const r = await a.post('/auth/google').send({ idToken: 'x' });
    expect(r.status).toBe(200);
    expect(r.headers['set-cookie'][0]).toMatch(/HttpOnly/);
    expect((await a.get('/api/me')).body).toMatchObject({ id: 'J020003', role: 'employee' });
  });
  test('Google login is refused for a wrong domain, an unverified email, an invalid token and a non-employee', async () => {
    const bad = (v, cfg) => request(mkApp(cfg, v)).post('/auth/google').send({ idToken: 'x' });
    expect((await bad(async () => ({ email: 'a@example.test', emailVerified: true, hd: 'evil.test' }), { allowedDomain: 'corp.test' })).status).toBe(401);
    expect((await bad(async () => ({ email: 'a@example.test', emailVerified: false, hd: 'corp.test' }))).status).toBe(401);
    expect((await bad(async () => { throw new Error('bad signature'); })).status).toBe(401);
    expect((await bad(async () => ({ email: 'stranger@corp.test', emailVerified: true, hd: 'corp.test' }))).status).toBe(403);
    const log = (await db.query("SELECT action FROM audit_log WHERE action='login_denied'")).rows;
    expect(log.length).toBeGreaterThanOrEqual(4);
  });
  test('a deactivated employee cannot log in, and an existing session stops working', async () => {
    const app = mkApp();
    expect((await request(app).post('/auth/dev-login').send({ email: 'gone@example.test' })).status).toBe(403);
    const cookie = 'zx_session=' + makeSession('J020009', SECRET);
    expect((await request(app).get('/api/me').set('Cookie', cookie)).status).toBe(401);
  });
  test('the dev login does not exist in production and production needs a real secret', async () => {
    expect(() => mkApp({ production: true, sessionSecret: 'short' })).toThrow();
    const prod = mkApp({ production: true, devLogin: true, sessionSecret: SECRET });
    expect((await request(prod).post('/auth/dev-login').send({ email: 'a@example.test' })).status).toBe(404);
  });
  test('login attempts are rate limited', async () => {
    const app = mkApp({}, async () => { throw new Error('nope'); });
    let last; for (let i = 0; i < 12; i++) last = await request(app).post('/auth/google').send({ idToken: 'x' });
    expect(last.status).toBe(429);
  });
  test('a cross-site request with a foreign Origin is refused', async () => {
    const app = mkApp({ allowedOrigins: ['https://portal.example.test'] });
    expect((await request(app).post('/auth/dev-login').set('Origin', 'https://evil.test').send({ email: 'a@example.test' })).status).toBe(403);
    expect((await request(app).post('/auth/dev-login').set('Origin', 'https://portal.example.test').send({ email: 'a@example.test' })).status).toBe(200);
  });
});

describe('punch and location privacy', () => {
  test('the server reads the IP itself, labels the network, keeps five years, and hides the location from the phone', async () => {
    const app = mkApp(), a = await loginAs(app, 'a@example.test');
    const r = await a.post('/api/punch').set('X-Forwarded-For', '203.0.113.5').send({ kind: 'in' });
    expect(r.status).toBe(201);
    expect(Object.keys(r.body).sort()).toEqual(['at', 'id', 'kind']);            // 手機收到的回應沒有 IP 與位置
    const row = (await db.query('SELECT * FROM punches WHERE id=$1', [r.body.id])).rows[0];
    expect(row).toMatchObject({ emp_id: 'J020003', kind: 'in', ip: '203.0.113.5', net_kind: 'office', net_place: '示範辦公室' });
    const years = new Date(row.keep_until).getUTCFullYear() - new Date(row.at).getUTCFullYear();
    expect(years).toBe(5);
    const mine = (await a.get('/api/punches')).body;
    expect(mine.length).toBeGreaterThan(0);
    expect(mine[0]).not.toHaveProperty('ip');                                    // 自己看自己的也沒有位置
  });
  test('another network is labelled as other, and a spoofed leftmost X-Forwarded-For is ignored', async () => {
    const app = mkApp(), a = await loginAs(app, 'a@example.test');
    const r = await a.post('/api/punch').set('X-Forwarded-For', '203.0.113.5, 198.51.100.77').send({ kind: 'out', offline: true, clientAt: new Date(Date.now() - 3600_000).toISOString() });
    const row = (await db.query('SELECT * FROM punches WHERE id=$1', [r.body.id])).rows[0];
    expect(row).toMatchObject({ ip: '198.51.100.77', net_kind: 'other', offline_queued: true });
  });
  test('validation: kind and client time', async () => {
    const app = mkApp(), a = await loginAs(app, 'a@example.test');
    expect((await a.post('/api/punch').send({ kind: 'lunch' })).status).toBe(400);
    expect((await a.post('/api/punch').send({ kind: 'in', clientAt: new Date(Date.now() + 3600_000).toISOString() })).status).toBe(400);
    expect((await a.post('/api/punch').send({ kind: 'in', clientAt: 'not a date' })).status).toBe(400);
    expect((await request(app).post('/api/punch').send({ kind: 'in' })).status).toBe(401);
  });
  test('an employee cannot read others; HR can, with location, and every look is logged', async () => {
    const app = mkApp(), emp = await loginAs(app, 'a@example.test'), hr = await loginAs(app, 'hr@example.test');
    expect((await emp.get('/api/punches?emp=J020001')).status).toBe(403);
    const other = (await hr.get('/api/punches?emp=J020003')).body;
    expect(other.length).toBeGreaterThan(0);
    expect(other[0]).toHaveProperty('ip');
    const log = (await db.query("SELECT detail FROM audit_log WHERE action='view_punches' AND actor_id='J020002'")).rows;
    expect(log.length).toBeGreaterThan(0);
  });
});

describe('server-side permissions and audit', () => {
  test('the audit log is only for roles with the permissions cap (administrator, manager)', async () => {
    const app = mkApp();
    expect((await (await loginAs(app, 'hr@example.test')).get('/api/audit')).status).toBe(403);
    expect((await (await loginAs(app, 'a@example.test')).get('/api/audit')).status).toBe(403);
    const r = await (await loginAs(app, 'admin@example.test')).get('/api/audit');
    expect(r.status).toBe(200);
    expect(r.body.map(x => x.action)).toEqual(expect.arrayContaining(['login_ok', 'punch', 'denied']));
  });
  test('the rules file covers all 15 roles', () => {
    expect(roleKeys.length).toBe(15);
    expect(can('hr', 'punchLoc')).toBe(true);
    expect(can('employee', 'punchLoc')).toBe(false);
    expect(can('nobody', 'salary')).toBe(false);
  });
});
