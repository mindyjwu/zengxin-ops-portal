/** 上線前的把關：正式環境設定檢查、健康檢查、安全標頭、同時起多個實例時建表不打架、真的以正式模式啟動與收尾。
 *  後兩項需要真正的 PostgreSQL（設 TEST_PG_ADMIN_URL）；沒設就略過，CI 與本機有 PostgreSQL 時會跑。 */
const { spawn } = require('child_process');
const path = require('path');
const request = require('supertest');
const { loadConfig } = require('../server/config');
const { createDb, tempDatabase } = require('../server/db');
const { createApp } = require('../server/app');
const { bootstrapAdmin } = require('../server/bootstrap');

const GOOD = { NODE_ENV: 'production', DATABASE_URL: 'postgres://u:p@/db?host=/cloudsql/p:r:i', SESSION_SECRET: 'x'.repeat(40), GOOGLE_CLIENT_ID: 'id.apps.googleusercontent.com', ALLOWED_DOMAIN: 'example.com', ALLOWED_ORIGINS: 'https://portal.example.com', TRUSTED_HOPS: '1', STORAGE_DRIVER: 'gcs', STORAGE_BUCKET: 'zengxin-test-files' };
const realPg = process.env.TEST_PG_ADMIN_URL ? test : test.skip;

describe('production configuration', () => {
  test('a complete production config is accepted', () => {
    const c = loadConfig(GOOD); expect(c).toMatchObject({ production: true, port: 8080, trustedHops: 1, allowedOrigins: ['https://portal.example.com'], devLogin: false });
  });
  test('everything that is missing is listed at once, not one by one', () => {
    let msg = ''; try { loadConfig({ NODE_ENV: 'production' }); } catch (e) { msg = e.message; }
    for (const k of ['DATABASE_URL', 'SESSION_SECRET', 'GOOGLE_CLIENT_ID', 'ALLOWED_DOMAIN', 'ALLOWED_ORIGINS', 'TRUSTED_HOPS', 'STORAGE_DRIVER']) expect(msg).toContain(k);
  });
  test('weak or unsafe values are refused', () => {
    const bad = o => { try { loadConfig({ ...GOOD, ...o }); return ''; } catch (e) { return e.message; } };
    expect(bad({ SESSION_SECRET: 'short' })).toContain('SESSION_SECRET');
    expect(bad({ ALLOWED_ORIGINS: 'http://portal.example.com' })).toContain('https://');                // 不是 https
    expect(bad({ ALLOWED_ORIGINS: 'https://portal.example.com/' })).toContain('ALLOWED_ORIGINS');       // 結尾斜線
    expect(bad({ ALLOWED_ORIGINS: 'https://a.example.com,*' })).toContain('ALLOWED_ORIGINS');
    expect(bad({ TRUSTED_HOPS: '9' })).toContain('TRUSTED_HOPS'); expect(bad({ TRUSTED_HOPS: 'x' })).toContain('TRUSTED_HOPS'); expect(bad({ TRUSTED_HOPS: '' })).toContain('TRUSTED_HOPS');
    expect(bad({ DEV_LOGIN: '1' })).toContain('DEV_LOGIN'); expect(bad({ PORT: '99999' })).toContain('PORT');
    expect(loadConfig({ ...GOOD, SEED: '1' }).seed).toBe(false);                                         // 正式環境不會寫入示範資料
  });
  test('file storage: production must use Cloud Storage with a valid bucket; local and memory are refused', () => {
    const bad = o => { try { loadConfig({ ...GOOD, ...o }); return ''; } catch (e) { return e.message; } };
    expect(loadConfig(GOOD)).toMatchObject({ storageDriver: 'gcs', storageBucket: 'zengxin-test-files', maxUploadBytes: 10 * 1024 * 1024 });
    expect(bad({ STORAGE_DRIVER: 'local', STORAGE_DIR: '/tmp/x' })).toContain('正式環境要用 gcs');      // Cloud Run 的磁碟重啟就消失
    expect(bad({ STORAGE_DRIVER: 'memory' })).toContain('正式環境要用 gcs');
    expect(bad({ STORAGE_DRIVER: '', STORAGE_DIR: '' })).toContain('STORAGE_DRIVER');                    // 沒設：預設是記憶體，正式環境不接受
    expect(bad({ STORAGE_BUCKET: '' })).toContain('STORAGE_BUCKET');
    expect(bad({ STORAGE_BUCKET: 'Bad Bucket!' })).toContain('STORAGE_BUCKET');
    expect(bad({ STORAGE_DRIVER: 'ftp' })).toContain('STORAGE_DRIVER：只能是');
    expect(bad({ MAX_UPLOAD_MB: '0' })).toContain('MAX_UPLOAD_MB'); expect(bad({ MAX_UPLOAD_MB: '99' })).toContain('MAX_UPLOAD_MB'); expect(bad({ MAX_UPLOAD_MB: 'x' })).toContain('MAX_UPLOAD_MB');
    expect(loadConfig({ ...GOOD, MAX_UPLOAD_MB: '5' }).maxUploadBytes).toBe(5 * 1024 * 1024);
  });
  test('outside production the storage defaults to memory, or to a local folder when one is given', () => {
    expect(loadConfig({})).toMatchObject({ storageDriver: 'memory', storageDir: '' });
    expect(loadConfig({ STORAGE_DIR: '/tmp/zx' })).toMatchObject({ storageDriver: 'local', storageDir: '/tmp/zx' });
    expect(() => loadConfig({ STORAGE_DRIVER: 'local' })).toThrow('STORAGE_DIR');
    expect(() => loadConfig({ STORAGE_DRIVER: 'gcs' })).toThrow('STORAGE_BUCKET');
  });
  test('outside production there are safe defaults for development', () => {
    expect(loadConfig({})).toMatchObject({ production: false, trustedHops: 1, devLogin: false, databaseUrl: '' });
    expect(loadConfig({ SEED: '1', DEV_LOGIN: '1' })).toMatchObject({ seed: true, devLogin: true });
  });
  test('a Cloud SQL unix-socket connection string is understood by the driver', () => {
    const parse = require('pg-connection-string').parse, c = parse(GOOD.DATABASE_URL);
    expect(c).toMatchObject({ user: 'u', password: 'p', database: 'db', host: '/cloudsql/p:r:i' });
  });
});

describe('first administrator', () => {
  test('is created once, only when the roster is empty, and the setting does nothing afterwards', async () => {
    const db = await createDb();
    expect(await bootstrapAdmin(db, {})).toEqual({ skipped: 'not_set' });
    expect(await bootstrapAdmin(db, { email: 'boss@example.com' })).toEqual({ created: 'J020001' });
    expect((await db.query('SELECT id, role, unit_id, status FROM employees')).rows).toEqual([{ id: 'J020001', role: 'admin', unit_id: 'J02', status: 'active' }]);
    expect(await bootstrapAdmin(db, { email: 'boss@example.com' })).toEqual({ skipped: 'not_empty' });
    expect(await bootstrapAdmin(db, { email: 'someone-else@example.com' })).toEqual({ skipped: 'not_empty' });     // 之後拿別的 email 也不會多建一位
    expect((await db.query('SELECT count(*)::int AS n FROM employees')).rows[0].n).toBe(1);
    expect((await db.query("SELECT action, target FROM audit_log WHERE action='bootstrap_admin'")).rows).toEqual([{ action: 'bootstrap_admin', target: 'J020001' }]);
    const app = createApp({ db, verifyGoogle: async () => ({ email: 'boss@example.com', emailVerified: true, hd: 'example.com' }), config: { sessionSecret: 'x'.repeat(40), allowedDomain: 'example.com' } });
    expect((await request(app).post('/auth/google').send({ idToken: 'x' })).status).toBe(200);                    // 這一位真的能用 Google 登入
    await db.close();
  });
  test('two instances starting together create it only once', async () => {
    const db = await createDb(); const r = await Promise.all([1, 2, 3].map(() => bootstrapAdmin(db, { email: 'boss@example.com' })));
    expect(r.filter(x => x.created)).toHaveLength(1); expect((await db.query('SELECT count(*)::int AS n FROM employees')).rows[0].n).toBe(1); await db.close();
  });
  test('the config must be an email inside the allowed domain', () => {
    const bad = e => { try { loadConfig({ ...GOOD, BOOTSTRAP_ADMIN_EMAIL: e }); return ''; } catch (x) { return x.message; } };
    expect(bad('boss@other.com')).toContain('BOOTSTRAP_ADMIN_EMAIL'); expect(bad('not-an-email')).toContain('BOOTSTRAP_ADMIN_EMAIL');
    expect(loadConfig({ ...GOOD, BOOTSTRAP_ADMIN_EMAIL: 'Boss@Example.com' }).bootstrapAdminEmail).toBe('boss@example.com'); expect(loadConfig(GOOD).bootstrapAdminEmail).toBe('');
  });
});

describe('health checks and headers', () => {
  const mk = (db, production) => createApp({ db, verifyGoogle: async () => ({}), config: { production, sessionSecret: 'x'.repeat(40), trustedHops: 1 } });
  test('/healthz never touches the database; /readyz does and says 503 when it is down', async () => {
    const down = { query: async () => { throw new Error('db down'); }, tx: async () => { throw new Error('db down'); } };
    const app = mk(down, false);
    expect((await request(app).get('/healthz')).body).toEqual({ ok: true });
    const r = await request(app).get('/readyz'); expect([r.status, r.body]).toEqual([503, { ok: false }]);
    const db = await createDb(); const ok = await request(mk(db, false)).get('/readyz'); expect([ok.status, ok.body]).toEqual([200, { ok: true }]); await db.close();
  });
  test('HSTS only in production; frame-ancestors always; no framework banner', async () => {
    const db = await createDb();
    const prod = await request(mk(db, true)).get('/healthz'), dev = await request(mk(db, false)).get('/healthz');
    expect(prod.headers['strict-transport-security']).toBe('max-age=31536000; includeSubDomains'); expect(dev.headers['strict-transport-security']).toBeUndefined();
    expect(prod.headers['content-security-policy']).toContain("frame-ancestors 'none'"); expect(prod.headers['x-powered-by']).toBeUndefined();
    expect(prod.headers['x-frame-options']).toBe('DENY'); await db.close();
  });
});

describe('real PostgreSQL', () => {
  realPg('several instances starting at once create the tables once, without errors', async () => {
    const t = await tempDatabase(process.env.TEST_PG_ADMIN_URL);
    const dbs = await Promise.all([1, 2, 3, 4, 5].map(() => createDb({ url: t.url })));       // 模擬 Cloud Run 同時起 5 個實例
    const n = require('fs').readdirSync(path.resolve(__dirname, '../server/migrations')).filter(f => f.endsWith('.sql')).length;
    expect((await dbs[0].query('SELECT count(*)::int AS n FROM schema_migrations')).rows[0].n).toBe(n);
    await Promise.all(dbs.map(d => d.close())); await t.drop();
  });

  const run = (env, ms = 15000) => new Promise(resolve => {
    const p = spawn('node', ['server/index.js'], { cwd: path.resolve(__dirname, '..'), env: { PATH: process.env.PATH, ...env } }); let out = '';
    p.stdout.on('data', d => { out += d; }); p.stderr.on('data', d => { out += d; }); const to = setTimeout(() => p.kill('SIGKILL'), ms);
    p.on('exit', code => { clearTimeout(to); resolve({ code, out }); }); p.out = () => out; p.send = s => p.kill(s); resolve.p = p;
    run.last = p;
  });
  realPg('started in production mode it refuses an incomplete config, serves when complete, and exits cleanly on SIGTERM', async () => {
    const refused = await run({ NODE_ENV: 'production' }); expect(refused.code).toBe(1); expect(refused.out).toContain('拒絕啟動');
    const t = await tempDatabase(process.env.TEST_PG_ADMIN_URL), port = 8140 + Math.floor(Math.random() * 50);
    const done = run({ ...GOOD, DATABASE_URL: t.url, PORT: String(port) }), p = run.last;
    for (let i = 0; i < 60; i++) { try { if ((await fetch(`http://localhost:${port}/readyz`)).ok) break; } catch (_) { /* 還沒好 */ } await new Promise(r => setTimeout(r, 250)); }
    const h = await fetch(`http://localhost:${port}/healthz`); expect(h.status).toBe(200); expect(h.headers.get('strict-transport-security')).toContain('max-age');
    expect((await fetch(`http://localhost:${port}/readyz`)).status).toBe(200);
    expect((await (await fetch(`http://localhost:${port}/auth/config`)).json())).toEqual({ googleClientId: GOOD.GOOGLE_CLIENT_ID, devLogin: false });
    expect((await fetch(`http://localhost:${port}/`)).status).toBe(200);                             // 網站的靜態檔也在容器裡
    expect((await fetch(`http://localhost:${port}/api/me`)).status).toBe(401);
    p.kill('SIGTERM'); const r = await done; expect(r.code).toBe(0); expect(r.out).toContain('SIGTERM');
    await t.drop();
  }, 40000);
});
