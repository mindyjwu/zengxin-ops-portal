/**
 * 後端 API（第一版切片：登入、權限、打卡、稽核紀錄）。
 * createApp 把資料庫與 Google 驗證做成參數傳進來，測試時可以換成假的。
 */
const express = require('express');
const { makeSession, readSession, parseCookies, limiter } = require('./auth');
const { can, requireCap } = require('./permissions');
const { clientIp, punchRecord } = require('../backend/punch-ip');

function createApp({ db, verifyGoogle, config }) {
  const cfg = { sessionSecret: '', allowedDomain: '', allowedOrigins: [], trustedHops: 1, devLogin: false, production: false, ...config };
  if (cfg.production && cfg.sessionSecret.length < 32) throw new Error('正式環境必須設定至少 32 字元的 SESSION_SECRET');
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '50kb' }));

  /* 安全標頭：不讓別的網站把我們嵌進去、不讓瀏覽器亂猜檔案類型 */
  app.use((req, res, next) => {
    res.set({ 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-store' });
    next();
  });
  /* 會改資料的請求：如果帶了 Origin，必須是我們允許的網站（擋跨站偽造請求） */
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.headers.origin && cfg.allowedOrigins.length && !cfg.allowedOrigins.includes(req.headers.origin)) return res.status(403).json({ error: 'bad_origin' });
    next();
  });

  const ipOf = req => clientIp(req.headers, req.socket.remoteAddress, cfg.trustedHops);
  const audit = async (req, action, target, detail) =>
    db.query('INSERT INTO audit_log (actor_id, action, target, detail, ip) VALUES ($1,$2,$3,$4,$5)', [req.user ? req.user.id : null, action, target || null, detail ? JSON.stringify(detail) : null, ipOf(req)]);

  /* 辨識登入者：讀 cookie → 驗簽章 → 查員工（離職或停用的人立刻失效） */
  app.use(async (req, res, next) => {
    const s = readSession(parseCookies(req.headers.cookie).zx_session, cfg.sessionSecret);
    if (s) {
      const r = await db.query("SELECT id, name, email, role, unit_id FROM employees WHERE id=$1 AND status='active'", [s.sub]);
      if (r.rows[0]) req.user = r.rows[0];
    }
    next();
  });

  const loginOk = limiter(10, 60_000);
  const setSession = (res, empId) => {
    const attrs = ['HttpOnly', 'Path=/', 'SameSite=Lax', 'Max-Age=28800'].concat(cfg.production ? ['Secure'] : []);
    res.set('Set-Cookie', `zx_session=${makeSession(empId, cfg.sessionSecret)}; ${attrs.join('; ')}`);
  };
  const login = async (req, res, email) => {
    const r = await db.query("SELECT id, name, role FROM employees WHERE lower(email)=lower($1) AND status='active'", [email]);
    if (!r.rows[0]) { await audit(req, 'login_denied', email, { reason: 'not_an_employee' }); return res.status(403).json({ error: 'not_an_employee' }); }
    req.user = r.rows[0]; setSession(res, r.rows[0].id);
    await audit(req, 'login_ok', r.rows[0].id);
    res.json({ id: r.rows[0].id, name: r.rows[0].name, role: r.rows[0].role });
  };

  app.get('/healthz', (req, res) => res.json({ ok: true }));

  app.post('/auth/google', async (req, res) => {
    if (!loginOk(ipOf(req))) return res.status(429).json({ error: 'too_many_attempts' });
    try {
      const g = await verifyGoogle(String((req.body || {}).idToken || ''));
      if (!g.emailVerified) throw new Error('email_not_verified');
      if (cfg.allowedDomain && g.hd !== cfg.allowedDomain) throw new Error('wrong_domain');
      await login(req, res, g.email);
    } catch (e) {
      await audit(req, 'login_denied', null, { reason: String(e.message || 'invalid_token').slice(0, 80) });
      res.status(401).json({ error: 'invalid_login' });
    }
  });

  /* 開發與測試用的假登入：只有明確開啟、且不是正式環境才存在 */
  if (cfg.devLogin && !cfg.production) app.post('/auth/dev-login', async (req, res) => login(req, res, String((req.body || {}).email || '')));

  app.post('/auth/logout', async (req, res) => {
    if (req.user) await audit(req, 'logout', req.user.id);
    res.set('Set-Cookie', 'zx_session=; HttpOnly; Path=/; Max-Age=0'); res.json({ ok: true });
  });

  const needLogin = (req, res, next) => req.user ? next() : res.status(401).json({ error: 'login_required' });
  app.get('/api/me', needLogin, (req, res) => res.json({ id: req.user.id, name: req.user.name, role: req.user.role, unit: req.user.unit_id, canSeeLocation: can(req.user.role, 'punchLoc') }));

  /* 打卡：IP 由伺服器自己讀；回傳給手機的內容不含位置（位置只給後台） */
  app.post('/api/punch', needLogin, async (req, res) => {
    const { kind, clientAt, offline } = req.body || {};
    if (!['in', 'out'].includes(kind)) return res.status(400).json({ error: 'bad_kind' });
    const ca = clientAt ? new Date(clientAt) : null;
    if (clientAt && (isNaN(ca) || ca.getTime() > Date.now() + 5 * 60_000)) return res.status(400).json({ error: 'bad_client_time' });
    const offices = (await db.query('SELECT name, cidrs FROM offices')).rows;
    const rec = punchRecord({ empId: req.user.id, type: kind, headers: req.headers, socketAddress: req.socket.remoteAddress, offices, trustedHops: cfg.trustedHops });
    const r = await db.query('INSERT INTO punches (emp_id, kind, client_at, offline_queued, ip, net_kind, net_place, keep_until) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id, at',
      [req.user.id, kind, ca ? ca.toISOString() : null, !!offline, rec.ip, rec.netKind, rec.netPlace, rec.keepUntil]);
    await audit(req, 'punch', req.user.id, { kind, offline: !!offline });
    res.status(201).json({ id: r.rows[0].id, at: r.rows[0].at, kind });
  });

  /* 查打卡：自己的永遠可以看（不含位置）；別人的要有管理權限，位置還要有 punchLoc，而且每次查都留紀錄 */
  app.get('/api/punches', needLogin, async (req, res) => {
    const emp = String(req.query.emp || req.user.id);
    const mine = emp === req.user.id;
    if (!mine && !(can(req.user.role, 'mgmt') && can(req.user.role, 'exportAll'))) { await audit(req, 'denied', '/api/punches', { emp }); return res.status(403).json({ error: 'forbidden' }); }
    const withLoc = can(req.user.role, 'punchLoc') && !mine;
    const r = await db.query(`SELECT id, emp_id, kind, at, client_at, offline_queued${withLoc ? ', ip, net_kind, net_place' : ''} FROM punches WHERE emp_id=$1 ORDER BY at DESC LIMIT 200`, [emp]);
    if (!mine) await audit(req, 'view_punches', emp, { rows: r.rows.length, withLocation: withLoc });
    res.json(r.rows);
  });

  app.get('/api/audit', needLogin, requireCap('perms', audit), async (req, res) => {
    const r = await db.query('SELECT id, at, actor_id, action, target, detail, ip FROM audit_log ORDER BY id DESC LIMIT 200');
    res.json(r.rows);
  });

  app.use((err, req, res, next) => { console.error(err); res.status(500).json({ error: 'server_error' }); });   // eslint-disable-line no-unused-vars
  return app;
}

module.exports = { createApp };
