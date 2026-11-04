/** 啟動伺服器：讀環境變數 → 連資料庫（自動建表）→ 開始接請求。 */
const { createDb } = require('./db');
const { createApp } = require('./app');
const { googleVerifier } = require('./auth');

(async () => {
  const env = process.env, production = env.NODE_ENV === 'production';
  const db = await createDb({ url: env.DATABASE_URL, dataDir: env.PGLITE_DIR });
  const verifyGoogle = env.GOOGLE_CLIENT_ID ? googleVerifier(env.GOOGLE_CLIENT_ID) : async () => { throw new Error('GOOGLE_CLIENT_ID 沒設定'); };
  const app = createApp({ db, verifyGoogle, config: {
    production, sessionSecret: env.SESSION_SECRET || (production ? '' : 'dev-only-secret-dev-only-secret-0000'),
    allowedDomain: env.ALLOWED_DOMAIN || '', allowedOrigins: (env.ALLOWED_ORIGINS || '').split(',').filter(Boolean),
    trustedHops: +(env.TRUSTED_HOPS || 1), devLogin: env.DEV_LOGIN === '1'
  } });
  const port = +(env.PORT || 8080);
  app.listen(port, () => console.log(`API listening on ${port} (${env.DATABASE_URL ? 'PostgreSQL' : 'PGlite in-memory'})`));
})().catch(e => { console.error(e); process.exit(1); });
