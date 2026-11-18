/** 啟動伺服器：讀環境變數並檢查 → 連資料庫（自動建表）→ 開始接請求；收到停止訊號（Cloud Run 換版或縮減時會送）就好好收尾。 */
const { createDb } = require('./db');
const { createApp } = require('./app');
const { googleVerifier } = require('./auth');
const { loadConfig } = require('./config');
const { bootstrapAdmin } = require('./bootstrap');

(async () => {
  const cfg = loadConfig(process.env);
  const db = await createDb({ url: cfg.databaseUrl, dataDir: cfg.pgliteDir });
  if (cfg.seed) await require('./seed').seed(db);   // 開發用：寫入虛構示範員工
  const boot = await bootstrapAdmin(db, { email: cfg.bootstrapAdminEmail }); if (boot.created) console.log(`已建立第一位系統管理員 ${boot.created}（${cfg.bootstrapAdminEmail}）；之後可以把 BOOTSTRAP_ADMIN_EMAIL 拿掉`);
  const verifyGoogle = cfg.googleClientId ? googleVerifier(cfg.googleClientId) : async () => { throw new Error('GOOGLE_CLIENT_ID 沒設定'); };
  const app = createApp({ db, verifyGoogle, config: cfg });
  const server = app.listen(cfg.port, () => console.log(`API listening on ${cfg.port} (${cfg.databaseUrl ? 'PostgreSQL' : 'PGlite in-memory'})`));
  let stopping = false;
  const stop = signal => {
    if (stopping) return; stopping = true; console.log(`收到 ${signal}，停止接新請求並收尾`);
    const force = setTimeout(() => { console.error('收尾逾時，強制結束'); process.exit(1); }, 8000); force.unref();      // Cloud Run 給 10 秒，我們 8 秒內收完
    server.close(async () => { try { await db.close(); } catch (e) { console.error(e); } process.exit(0); });
    server.closeIdleConnections && server.closeIdleConnections();
  };
  process.on('SIGTERM', () => stop('SIGTERM')); process.on('SIGINT', () => stop('SIGINT'));
})().catch(e => { console.error(e.message || e); process.exit(1); });
