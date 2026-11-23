/**
 * 讀環境變數、檢查、整理成設定。正式環境缺什麼就一次全部列出來並拒絕啟動，不要等到半夜才發現少設了一個。
 * 非正式環境（本機、測試）有預設值，方便開發。
 */
function loadConfig(env = process.env) {
  const production = env.NODE_ENV === 'production', errors = [], get = k => String(env[k] ?? '').trim();
  const origins = get('ALLOWED_ORIGINS').split(',').map(x => x.trim()).filter(Boolean), hopsRaw = get('TRUSTED_HOPS');
  const cfg = {
    production, port: +(get('PORT') || 8080), databaseUrl: get('DATABASE_URL'), pgliteDir: get('PGLITE_DIR'), seed: get('SEED') === '1' && !production,
    sessionSecret: get('SESSION_SECRET') || (production ? '' : 'dev-only-secret-dev-only-secret-0000'), googleClientId: get('GOOGLE_CLIENT_ID'), allowedDomain: get('ALLOWED_DOMAIN'),
    allowedOrigins: origins, trustedHops: hopsRaw === '' ? 1 : +hopsRaw, devLogin: get('DEV_LOGIN') === '1', bootstrapAdminEmail: get('BOOTSTRAP_ADMIN_EMAIL').toLowerCase(),
    /* 檔案儲存：沒指定時，有 STORAGE_DIR 就用本機資料夾，否則只放記憶體（本機與測試）；正式環境一定要用 Cloud Storage */
    storageDriver: get('STORAGE_DRIVER') || (get('STORAGE_DIR') ? 'local' : 'memory'), storageDir: get('STORAGE_DIR'), storageBucket: get('STORAGE_BUCKET'),
    maxUploadBytes: (get('MAX_UPLOAD_MB') === '' ? 10 : +get('MAX_UPLOAD_MB')) * 1024 * 1024
  };
  if (!['memory', 'local', 'gcs'].includes(cfg.storageDriver)) errors.push('STORAGE_DRIVER：只能是 memory、local 或 gcs');
  if (cfg.storageDriver === 'local' && !cfg.storageDir) errors.push('STORAGE_DIR：STORAGE_DRIVER=local 時要指定存放檔案的資料夾');
  if (cfg.storageDriver === 'gcs' && !/^[a-z0-9][a-z0-9._-]{1,220}[a-z0-9]$/.test(cfg.storageBucket)) errors.push('STORAGE_BUCKET：Cloud Storage 儲存桶名稱（小寫英數、點、底線、連字號）');
  if (!(cfg.maxUploadBytes >= 1024 * 1024 && cfg.maxUploadBytes <= 25 * 1024 * 1024)) errors.push('MAX_UPLOAD_MB：附件大小上限，1 到 25（MB）');
  if (production) {
    if (!cfg.databaseUrl) errors.push('DATABASE_URL：PostgreSQL 連線字串（Cloud SQL）');
    if (cfg.sessionSecret.length < 32) errors.push('SESSION_SECRET：至少 32 字元的隨機密鑰（放 Secret Manager，不能放進程式庫）');
    if (!cfg.googleClientId) errors.push('GOOGLE_CLIENT_ID：Google OAuth 用戶端 ID');
    if (!cfg.allowedDomain) errors.push('ALLOWED_DOMAIN：只允許登入的 Google Workspace 網域');
    if (!origins.length) errors.push('ALLOWED_ORIGINS：網站網址（https://...，逗號分隔），用來擋跨站請求');
    else if (origins.some(o => !/^https:\/\/[^/\s]+$/.test(o))) errors.push('ALLOWED_ORIGINS：每個網址要是 https://網域（不含路徑與結尾斜線）');
    if (hopsRaw === '' || !/^[0-5]$/.test(hopsRaw)) errors.push('TRUSTED_HOPS：伺服器前面有幾層可信任的代理（0 到 5 的整數，要實測；決定怎麼讀打卡的真實 IP）');
    if (cfg.bootstrapAdminEmail && !(/^[^@\s]+@[^@\s]+$/.test(cfg.bootstrapAdminEmail) && cfg.bootstrapAdminEmail.endsWith('@' + cfg.allowedDomain.toLowerCase()))) errors.push('BOOTSTRAP_ADMIN_EMAIL：要是 ALLOWED_DOMAIN 網域的 email（第一位管理員，只在員工名冊是空的時候建立一次）');
    if (cfg.devLogin) errors.push('DEV_LOGIN：正式環境不能開假登入（請移除這個變數）');
    if (cfg.storageDriver !== 'gcs') errors.push('STORAGE_DRIVER：正式環境要用 gcs（Cloud Run 的本機磁碟重啟就消失，記憶體更不行），並設定 STORAGE_BUCKET');
    if (!Number.isInteger(cfg.port) || cfg.port < 1 || cfg.port > 65535) errors.push('PORT：要是 1 到 65535 的整數');
  }
  if (errors.length) throw new Error('正式環境設定不完整，拒絕啟動：\n - ' + errors.join('\n - '));
  return cfg;
}

module.exports = { loadConfig };
