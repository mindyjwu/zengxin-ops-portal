/** 雲端腳本的把關：DRY_RUN 只印指令、不碰 Google、不洩漏祕密；關鍵保護（備份、刪除保護、只准這個程式庫部署、先測再切流量）都在；煙霧測試真的會抓出不對的設定。 */
const { execFile, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createDb } = require('../server/db');
const { createApp } = require('../server/app');

const root = path.resolve(__dirname, '..');
// 假的 gcloud：只要被呼叫就失敗，證明 DRY_RUN 完全沒有連 Google
const shim = fs.mkdtempSync(path.join(os.tmpdir(), 'fakegcloud-')); fs.writeFileSync(path.join(shim, 'gcloud'), '#!/bin/sh\necho "gcloud 不該被呼叫: $*" >&2\nexit 99\n', { mode: 0o755 });
const env = extra => ({ PATH: `${shim}:${process.env.PATH}`, HOME: os.tmpdir(), DRY_RUN: '1', ...extra });
const sh = (script, extra, args = []) => spawnSync('bash', [path.join(root, script), ...args], { env: env(extra), encoding: 'utf8' });
const BASE = { PROJECT_ID: 'zengxin-test', GITHUB_REPO: 'mindyjwu/zengxin-ops-portal', ALLOWED_DOMAIN: 'example.com', PORTAL_URL: 'https://portal.example.com', GOOGLE_CLIENT_ID: 'cid.apps.googleusercontent.com' };
afterAll(() => fs.rmSync(shim, { recursive: true, force: true }));

describe('setup.sh (dry run)', () => {
  const r = sh('scripts/gcp/setup.sh', { ...BASE, BILLING_ACCOUNT: 'AAAA-BBBB-CCCC' }), out = r.stdout;
  test('it never calls gcloud and needs a project id', () => {
    expect(r.status).toBe(0); expect(r.stderr).not.toContain('gcloud 不該被呼叫');
    const none = sh('scripts/gcp/setup.sh', { PROJECT_ID: '' }); expect(none.status).not.toBe(0); expect(none.stderr).toContain('PROJECT_ID');
  });
  test('the safety nets are there: backups, point-in-time recovery, deletion protection, private bucket, weekly export', () => {
    for (const s of ['--retained-backups-count=14', '--enable-point-in-time-recovery', '--retained-transaction-log-days=7', '--deletion-protection', '--public-access-prevention', '--uniform-bucket-level-access', '--versioning',
      'zengxin-weekly-export', '--schedule=0 4 * * 0', 'sqladmin.googleapis.com/v1/projects/zengxin-test/instances/zengxin-pg/export', 'portal-weekly.sql.gz', 'cloudsql.instances.export', '--budget-amount=3000TWD', '--region=asia-east1']) expect(out).toContain(s);
  });
  test('there is a private bucket for attachments, and only the runtime account can use it', () => {
    expect(out).toContain('storage.googleapis.com');
    expect(out).toContain('gcloud storage buckets create gs://zengxin-test-zengxin-files --location=asia-east1 --uniform-bucket-level-access --public-access-prevention');
    expect(out).toContain('gcloud storage buckets add-iam-policy-binding gs://zengxin-test-zengxin-files --member=serviceAccount:zengxin-run@zengxin-test.iam.gserviceaccount.com --role=roles/storage.objectUser');
    expect(out).not.toMatch(/allUsers|allAuthenticatedUsers/);
    expect(sh('scripts/gcp/setup.sh', { ...BASE, FILES_BUCKET: 'my-files' }).stdout).toContain('buckets create gs://my-files ');
  });
  test('GitHub can deploy only from this repository\'s main branch, with no key file', () => {
    expect(out).toContain("assertion.repository=='mindyjwu/zengxin-ops-portal' && assertion.ref=='refs/heads/main'");
    expect(out).toContain('attribute.repository/mindyjwu/zengxin-ops-portal'); expect(out).not.toMatch(/keys create|--key-file|credentials\.json/);
  });
  test('secrets are generated inside the script and never printed; roles are narrow', () => {
    expect(out).toContain('值不顯示'); expect(out).not.toMatch(/postgres:\/\//); expect(out).not.toMatch(/[0-9a-f]{40,}/);
    expect(out).not.toMatch(/roles\/(owner|editor)\b/); expect(out).toContain('roles/cloudsql.client'); expect(out).toContain('roles/secretmanager.secretAccessor'); expect(out).toContain('roles/run.admin');
    expect(out.indexOf('services enable')).toBeLessThan(out.indexOf('sql instances create')); expect(out.indexOf('sql instances create')).toBeLessThan(out.indexOf('secrets')); expect(out).toContain('GCP_WORKLOAD_IDENTITY_PROVIDER');
  });
});

describe('deploy.sh (dry run)', () => {
  const IMG = 'asia-east1-docker.pkg.dev/zengxin-test/zengxin/api:abc123';
  test('a first deploy goes straight up and is smoke-tested', () => {
    const r = sh('scripts/gcp/deploy.sh', BASE, [IMG]); expect(r.status).toBe(0); expect(r.stdout).not.toContain('--no-traffic');
    expect(r.stdout.indexOf('run deploy')).toBeLessThan(r.stdout.indexOf('smoke.sh'));
  });
  test('an update is deployed without traffic, tested on its own URL, and only then given the traffic', () => {
    const o = sh('scripts/gcp/deploy.sh', { ...BASE, DRY_RUN_SERVICE_EXISTS: '1' }, [IMG]).stdout;
    const i = s => o.indexOf(s); expect(i('--no-traffic --tag candidate')).toBeGreaterThan(-1);
    expect(i('--no-traffic')).toBeLessThan(i('smoke.sh')); expect(i('smoke.sh')).toBeLessThan(i('--to-latest'));
    expect(o).toContain('https://candidate---'); expect(o).toContain('--https');
  });
  test('the runtime is configured safely: secrets from Secret Manager, Cloud SQL socket, production mode, capped instances', () => {
    const o = sh('scripts/gcp/deploy.sh', BASE, [IMG]).stdout;
    for (const s of ['--set-secrets SESSION_SECRET=zengxin-session-secret:latest,DATABASE_URL=zengxin-database-url:latest', '--add-cloudsql-instances zengxin-test:asia-east1:zengxin-pg', 'NODE_ENV=production', 'ALLOWED_DOMAIN=example.com', 'ALLOWED_ORIGINS=https://portal.example.com', '--max-instances 4', '--service-account zengxin-run@zengxin-test.iam.gserviceaccount.com']) expect(o).toContain(s);
    expect(o).not.toMatch(/SESSION_SECRET=[^z]/); expect(o).not.toContain('DEV_LOGIN');
  });
  test('the runtime is told to keep files in Cloud Storage (so production starts), and the bucket can be renamed', () => {
    const o = sh('scripts/gcp/deploy.sh', BASE, [IMG]).stdout;
    expect(o).toContain('@STORAGE_DRIVER=gcs@STORAGE_BUCKET=zengxin-test-zengxin-files');
    expect(sh('scripts/gcp/deploy.sh', { ...BASE, FILES_BUCKET: 'my-files' }, [IMG]).stdout).toContain('@STORAGE_BUCKET=my-files');
  });
  test('the first-admin setting is passed only when given', () => {
    expect(sh('scripts/gcp/deploy.sh', BASE, [IMG]).stdout).not.toContain('BOOTSTRAP_ADMIN_EMAIL');
    expect(sh('scripts/gcp/deploy.sh', { ...BASE, BOOTSTRAP_ADMIN_EMAIL: 'boss@example.com' }, [IMG]).stdout).toContain('@BOOTSTRAP_ADMIN_EMAIL=boss@example.com');
  });
  test('it refuses to run without the settings that would make the site unsafe', () => {
    for (const k of ['ALLOWED_DOMAIN', 'PORTAL_URL', 'GOOGLE_CLIENT_ID']) { const r = sh('scripts/gcp/deploy.sh', { ...BASE, [k]: '' }, [IMG]); expect(r.status).not.toBe(0); expect(r.stderr).toContain(k); }
    expect(sh('scripts/gcp/deploy.sh', BASE, []).status).not.toBe(0);
  });
});

describe('smoke.sh against a real server', () => {
  const start = async config => { const db = await createDb(), app = createApp({ db, verifyGoogle: async () => ({}), config: { sessionSecret: 'x'.repeat(40), trustedHops: 1, ...config } }); const srv = await new Promise(res => { const s = app.listen(0, () => res(s)); }); return { db, srv, url: `http://localhost:${srv.address().port}` }; };
  // 要用非同步的方式執行：同一個程序裡的測試伺服器要能回應 curl（用同步執行會互相卡死）
  const smoke = (url, ...a) => new Promise(res => execFile('bash', [path.join(root, 'scripts/smoke.sh'), url, ...a], { encoding: 'utf8' }, (err, stdout, stderr) => res({ status: err ? err.code || 1 : 0, stdout, stderr })));
  const stop = async x => { await new Promise(r => x.srv.close(r)); await x.db.close(); };
  test('a correctly configured production server passes, including the HSTS check', async () => {
    const x = await start({ production: true, googleClientId: 'cid' }); const r = await smoke(x.url, '--https'); await stop(x);
    expect(r.stdout).toContain('煙霧測試通過'); expect(r.status).toBe(0);
  });
  test('a server with the fake login still on, or with no Google client id, or no HSTS, is caught', async () => {
    let x = await start({ production: false, devLogin: true, googleClientId: 'cid' }); let r = await smoke(x.url); await stop(x); expect(r.status).not.toBe(0); expect(r.stderr).toContain('假登入');
    x = await start({ production: true, googleClientId: '' }); r = await smoke(x.url); await stop(x); expect(r.status).not.toBe(0); expect(r.stderr).toContain('GOOGLE_CLIENT_ID');
    x = await start({ production: false, googleClientId: 'cid' }); r = await smoke(x.url, '--https'); await stop(x); expect(r.status).not.toBe(0); expect(r.stderr).toContain('HSTS');
  }, 60000);
  test('a dead address fails instead of hanging', () => { const r = spawnSync('bash', [path.join(root, 'scripts/smoke.sh'), 'http://localhost:1'], { encoding: 'utf8', timeout: 60000, env: { ...process.env, SMOKE_TRIES: '2' } }); expect(r.status).not.toBe(0); expect(r.stderr).toContain('readyz'); }, 70000);
});
