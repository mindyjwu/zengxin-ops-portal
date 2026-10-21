/**
 * 打卡 IP 位置（後台）— 正式版後端會用到的小模組，原型網站沒有後端，所以這裡只是參考實作加測試。
 * 規則（10/20 會議）：記錄網路位置（IP）、不強制拍照、位置只給後台看、手機介面不顯示、出勤紀錄保存五年。
 */

/** 把 "203.0.113.5" 轉成數字；不是 IPv4 就回 null。IPv4-mapped IPv6（::ffff:1.2.3.4）也接受。 */
function ipv4ToInt(ip) {
  const s = String(ip || '').trim().replace(/^::ffff:/i, '');
  const m = s.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return null;
  const p = m.slice(1).map(Number);
  if (p.some(n => n > 255)) return null;
  return ((p[0] << 24) >>> 0) + (p[1] << 16) + (p[2] << 8) + p[3];
}

/** 判斷 IP 是否在 CIDR（例如 "203.0.113.0/28"）裡；只支援 IPv4，沒有 /n 就當成單一位址。 */
function inCidr(ip, cidr) {
  const [base, bitsStr] = String(cidr).split('/');
  const a = ipv4ToInt(ip), b = ipv4ToInt(base);
  if (a === null || b === null) return false;
  const bits = bitsStr === undefined ? 32 : Number(bitsStr);
  if (!Number.isInteger(bits) || bits < 0 || bits > 32) return false;
  if (bits === 0) return true;
  const mask = (0xffffffff << (32 - bits)) >>> 0;
  return ((a & mask) >>> 0) === ((b & mask) >>> 0);
}

/**
 * 取出打卡者的 IP。
 * X-Forwarded-For 最左邊的值可以被使用者自己偽造，所以不能直接拿；
 * 改成從右邊數，跳過自己信任的代理（trustedHops：Google 負載平衡器等前面有幾層）。
 * 沒有這個標頭時才用連線本身的位址。
 */
function clientIp(headers, socketAddress, trustedHops = 1) {
  const raw = headers && (headers['x-forwarded-for'] || headers['X-Forwarded-For']);
  if (raw) {
    const parts = String(raw).split(',').map(x => x.trim()).filter(Boolean);
    const i = parts.length - trustedHops;
    if (i >= 0 && parts[i]) return parts[i];
    if (parts.length) return parts[0];
  }
  return String(socketAddress || '').replace(/^::ffff:/i, '') || null;
}

/**
 * 依辦公室網路清單標示打卡網路：
 *   office＝辦公室網路；other＝其他網路（行動網路、家裡等，需要看個案家附近的外勤是否合理）；unknown＝沒有取得 IP。
 * offices：[{name:'誠馨總部', cidrs:['203.0.113.0/28']}]
 */
function classifyIp(ip, offices) {
  if (!ip) return { kind: 'unknown', place: null };
  for (const o of offices || []) {
    if ((o.cidrs || []).some(c => inCidr(ip, c))) return { kind: 'office', place: o.name };
  }
  return { kind: 'other', place: null };
}

/** 一筆要存進資料庫的打卡紀錄。位置欄位只給後台查詢用，不回傳給員工的手機。 */
function punchRecord({ empId, type, headers, socketAddress, offices, trustedHops, now = new Date() }) {
  const ip = clientIp(headers, socketAddress, trustedHops);
  const c = classifyIp(ip, offices);
  return {
    empId, type,                            // type：in／out
    at: now.toISOString(),                  // 時間要記到分鐘（勞基法第 30 條），這裡存完整時間
    ip, netKind: c.kind, netPlace: c.place, // 後台才看得到
    keepUntil: new Date(Date.UTC(now.getUTCFullYear() + 5, now.getUTCMonth(), now.getUTCDate())).toISOString().slice(0, 10)
  };
}

module.exports = { ipv4ToInt, inCidr, clientIp, classifyIp, punchRecord };
