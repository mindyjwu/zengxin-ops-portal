/**
 * 登入與工作階段。
 *  1. 員工在網頁按「用 Google 登入」，Google 給網頁一張 ID token（像一張有簽章的身分證明）。
 *  2. 網頁把 token 交給我們的伺服器；伺服器驗證簽章、受眾（是不是發給我們的）、網域，再用 email 對到員工。
 *  3. 驗證通過後，伺服器發一個簽章過的 cookie（工作階段），之後的請求靠它辨識身分。
 */
const crypto = require('crypto');

const b64 = b => Buffer.from(b).toString('base64url');
const sign = (data, secret) => crypto.createHmac('sha256', secret).update(data).digest('base64url');

function makeSession(sub, secret, ttlSec = 8 * 3600, now = Date.now()) {
  const body = b64(JSON.stringify({ sub, exp: Math.floor(now / 1000) + ttlSec }));
  return body + '.' + sign(body, secret);
}

function readSession(token, secret, now = Date.now()) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [body, mac] = token.split('.');
  const good = sign(body, secret);
  if (mac.length !== good.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(good))) return null;   // 簽章不對＝被改過
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString());
    return p.exp * 1000 > now ? p : null;                                                                          // 過期就當沒登入
  } catch { return null; }
}

/** 真正向 Google 驗證 ID token（只有在設定 GOOGLE_CLIENT_ID 時使用；測試用假的取代） */
function googleVerifier(clientId) {
  const { OAuth2Client } = require('google-auth-library');
  const client = new OAuth2Client(clientId);
  return async idToken => {
    const t = await client.verifyIdToken({ idToken, audience: clientId });
    const p = t.getPayload();
    return { email: p.email, emailVerified: !!p.email_verified, hd: p.hd };
  };
}

function parseCookies(header) {
  const out = {};
  String(header || '').split(';').forEach(x => { const i = x.indexOf('='); if (i > 0) out[x.slice(0, i).trim()] = decodeURIComponent(x.slice(i + 1).trim()); });
  return out;
}

/** 很簡單的限流：同一個來源在一段時間內只能嘗試登入有限次，擋暴力嘗試 */
function limiter(max, windowMs) {
  const hits = new Map();
  return key => {
    const now = Date.now(), arr = (hits.get(key) || []).filter(t => now - t < windowMs);
    arr.push(now); hits.set(key, arr);
    return arr.length <= max;
  };
}

module.exports = { makeSession, readSession, googleVerifier, parseCookies, limiter };
