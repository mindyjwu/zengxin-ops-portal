/**
 * 牛津居家時薪制計薪引擎（需求端確認版，2026-11-08）。純函式，不碰資料庫，網站原型的 oxPay 與這裡算法相同（測試檢查兩邊一致）。
 * 實發 = 應發(A) + 加班費(B) − 代扣(C)。時薪級距用「正常工時 + 加班工時」（不含轉場）的分鐘數判斷。
 */
const DEFAULT_CONFIG = require('./ox-config.json');
const MIN_HOURLY = 196;                                  // 2026 基本工資時薪

const ROUND_MODES = ['up', 'round', 'down'];
const R = (mode, x) => { x = Math.round(x * 1e6) / 1e6; return mode === 'up' ? Math.ceil(x) : mode === 'down' ? Math.floor(x) : Math.round(x); };   // 先消掉浮點誤差，再進位

const blankRow = () => ({ empNo: '', name: '', early: false, regMin: 0, trWd: 0, trHol: 0, trNh: 0, ot: Array(14).fill(0), aa05: 0, aa06: 0, aa11: 0, aaFixed: 0,
  rural: 0, intro: 0, open: 0, other: 0, short: 0, labor: 0, health: 0, pension: 0, otherDed: 0, refRate: null });

function tierOf(cfg, judgeMin, early) {
  for (const t of cfg.tiers) if (t.lt == null || judgeMin < t.lt * 60) return { rate: early ? t.early : t.other, lt: t.lt };
  const t = cfg.tiers[cfg.tiers.length - 1]; return { rate: early ? t.early : t.other, lt: t.lt };
}

function pay(cfg, r, early) {
  const n = v => +v || 0, otMin = r.ot.reduce((a, b) => a + n(b), 0), judgeMin = n(r.regMin) + otMin;
  const tier = tierOf(cfg, judgeMin, early), rate = tier.rate, trMin = n(r.trWd) + n(r.trHol) + n(r.trNh);
  const base = R(cfg.round.base, n(r.regMin) / 60 * rate), transfer = R(cfg.round.transfer, trMin / 60 * cfg.transferRate);
  const aa = cfg.aa.AA05 * n(r.aa05) + cfg.aa.AA06 * n(r.aa06) + cfg.aa.AA11 * n(r.aa11) + n(r.aaFixed);
  const manual = ['rural', 'intro', 'open', 'other', 'short'].reduce((a, k) => a + n(r[k]), 0);
  const segs = cfg.ot.map((o, i) => { const raw = n(r.ot[i]) / 60 * rate * o.mult; return { i, day: o.day, band: o.band, mult: o.mult, min: n(r.ot[i]), raw, amt: R(cfg.round.otSeg, raw) }; }).filter(s => s.min > 0);
  const B = R(cfg.round.otTotal, segs.reduce((a, s) => a + s.raw, 0)), A = base + transfer + aa + manual;
  const C = n(r.labor) + n(r.health) + n(r.pension) + n(r.otherDed), net = R(cfg.round.net, A + B - C);
  const warn = [], nearest = cfg.tiers.filter(t => t.lt != null).map(t => Math.abs(t.lt * 60 - judgeMin)).sort((a, b) => a - b)[0];
  if (judgeMin > 0 && nearest != null && nearest <= 30) warn.push({ code: 'near_boundary', zh: '離級距邊界不到 30 分鐘，請確認分鐘數' });
  if (net < 0) warn.push({ code: 'negative_net', zh: '實發為負數', crit: true });
  if (rate < MIN_HOURLY) warn.push({ code: 'below_minimum', zh: '時薪低於基本工資 ' + MIN_HOURLY, crit: true });
  if (r.refRate != null && +r.refRate !== rate) warn.push({ code: 'rate_differs', zh: '與總表時薪 ' + r.refRate + ' 不同', crit: true });
  return { rate, judgeMin, early, base, transfer, aa, manual, A, segs, B, C, net, warn };
}

/** 檢查並整理規則設定（網頁送來的）；回傳 { config } 或 { error } */
function validateConfig(c) {
  const bad = why => ({ error: 'bad_config', why });
  if (!c || typeof c !== 'object') return bad('empty');
  const rate = v => Number.isFinite(+v) && +v >= 0 && +v <= 10000, mult = v => Number.isFinite(+v) && +v >= 0 && +v <= 10;
  if (!Array.isArray(c.tiers) || c.tiers.length < 1 || c.tiers.length > 6) return bad('tiers');
  const tiers = [];
  for (let i = 0; i < c.tiers.length; i++) {
    const t = c.tiers[i], last = i === c.tiers.length - 1;
    if (!t || !rate(t.early) || !rate(t.other)) return bad('tier_rate');
    if (last ? t.lt != null : !(Number.isFinite(+t.lt) && +t.lt > 0 && +t.lt <= 1000 && (i === 0 || +t.lt > tiers[i - 1].lt))) return bad('tier_threshold');
    tiers.push({ lt: last ? null : +t.lt, early: +t.early, other: +t.other });
  }
  if (!rate(c.transferRate)) return bad('transfer_rate');
  const aa = {}; for (const k of Object.keys(DEFAULT_CONFIG.aa)) { if (!rate((c.aa || {})[k])) return bad('aa_' + k); aa[k] = +c.aa[k]; }
  if (!Array.isArray(c.ot) || c.ot.length !== DEFAULT_CONFIG.ot.length) return bad('ot_length');
  const ot = c.ot.map((o, i) => ({ day: DEFAULT_CONFIG.ot[i].day, band: DEFAULT_CONFIG.ot[i].band, mult: mult(o && o.mult) ? +o.mult : NaN }));   // 日別與時段固定，只有倍率能改
  if (ot.some(o => Number.isNaN(o.mult))) return bad('ot_mult');
  const round = {}; for (const k of Object.keys(DEFAULT_CONFIG.round)) { if (!ROUND_MODES.includes((c.round || {})[k])) return bad('round_' + k); round[k] = c.round[k]; }
  return { config: { tiers, transferRate: +c.transferRate, aa, ot, round } };
}

module.exports = { DEFAULT_CONFIG, MIN_HOURLY, blankRow, tierOf, pay, validateConfig, R };
