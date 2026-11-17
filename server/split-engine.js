/**
 * 拆帳制計薪引擎（需求端 10/28 給付表）。純函式，不碰資料庫。
 * 應發＝拆帳薪資（每個服務項目有固定的計薪金額：平日用「計薪」、假日用「假日總薪」；方案 A 一般居服員、方案 B 日照司機）
 *      ＋業績獎金（依當月服務金額區間）＋偏鄉津貼（每案每月）＋各項加項；實發＝應發－各項扣項。
 * 專案負責人 2026-11-17 的決定：拆帳制先搬後端；薪資單沿用時薪制版型、把「加班」換成「服務項目明細」。
 * 還沒確認：業績獎金的金額基準（目前用服務金額）、見習與新進是加項還是扣項（目前當加項，在規則設定裡可改）。
 */
const svcCfg = require('./svc-config.json');

/** 每月輸入的加扣項：代碼固定，加項或扣項由規則版本決定（可改） */
const EXTRAS = [
  { k: 'transport10', label: '交通津貼（10 公里）', kind: 'add' }, { k: 'transport20', label: '交通津貼（20 公里以上）', kind: 'add' },
  { k: 'aaReward', label: 'AA 碼獎勵金', kind: 'add' }, { k: 'trainee', label: '見習', kind: 'add', pending: true }, { k: 'newhire', label: '新進', kind: 'add', pending: true },
  { k: 'intro', label: '介紹費', kind: 'add' }, { k: 'open', label: '開案費', kind: 'add' }, { k: 'lead', label: '組長津貼', kind: 'add' }, { k: 'otherAdd', label: '其他加項', kind: 'add' },
  { k: 'labor', label: '勞保自付額', kind: 'deduct' }, { k: 'health', label: '健保自付額', kind: 'deduct' }, { k: 'pension', label: '勞退自提', kind: 'deduct' },
  { k: 'enforce', label: '強制執行', kind: 'deduct' }, { k: 'liability', label: '責任險', kind: 'deduct' }, { k: 'otherDed', label: '其他代扣', kind: 'deduct' }
];
const DEFAULT_CONFIG = { rates: svcCfg.rates, bonus: svcCfg.bonus, remote: { areas: svcCfg.remote.areas, allow: svcCfg.remote.allow }, extras: EXTRAS };

const bonusOf = (cfg, amt) => { for (const [lo, hi, b] of cfg.bonus) if (amt >= lo && amt <= hi) return b; return amt > 100000 ? cfg.bonus[cfg.bonus.length - 1][2] : 0; };

/** inp：{ items: [{code, name, n, nh, amount}], billed, remoteCases, plan: 'A'|'B', extras: {k: 金額} } */
function pay(cfg, inp) {
  const byCode = new Map(cfg.rates.map(x => [x.code, x])), byName = new Map(cfg.rates.map(x => [x.name, x])), plan = inp.plan === 'B' ? 'B' : 'A';
  const lines = []; let itemRaw = 0, unpaid = 0;
  for (const it of inp.items) {
    const r = byCode.get(it.code) || byName.get(String(it.name).replace('處理費', ''));
    if (!r) { unpaid += it.n; lines.push({ code: it.code, name: it.name, nWeekday: it.n - it.nh, nHoliday: it.nh, price: null, holidayPrice: null, amount: 0, unpaid: true }); continue; }
    const wk = plan === 'B' ? r.B : r.A, hol = plan === 'B' ? r.hB : r.hA, amt = (it.n - it.nh) * wk + it.nh * hol;
    lines.push({ code: it.code, name: it.name, nWeekday: it.n - it.nh, nHoliday: it.nh, price: wk, holidayPrice: hol, amount: Math.round(amt * 100) / 100, unpaid: false }); itemRaw += amt;
  }
  const itemPay = Math.round(itemRaw), bonus = bonusOf(cfg, inp.billed || 0), remote = (inp.remoteCases || 0) * cfg.remote.allow;
  const adds = [], deducts = [];
  for (const e of cfg.extras) { const v = Math.round(+((inp.extras || {})[e.k]) || 0); if (!v) continue; (e.kind === 'add' ? adds : deducts).push({ k: e.k, item: e.label, amount: v }); }
  const addSum = adds.reduce((a, x) => a + x.amount, 0), C = deducts.reduce((a, x) => a + x.amount, 0), A = itemPay + bonus + remote + addSum, net = A - C;
  const warn = [];
  if (unpaid > 0) warn.push({ code: 'unpaid_codes', zh: `有 ${unpaid} 筆服務的碼別不在給付表，沒有計薪`, crit: true });
  if (net < 0) warn.push({ code: 'negative_net', zh: '實發為負數', crit: true });
  if (!lines.length && !adds.length) warn.push({ code: 'no_service', zh: '這個月沒有服務紀錄，只有輸入的項目' });
  return { plan, lines: lines.sort((a, b) => b.amount - a.amount), itemPay, billed: inp.billed || 0, bonus, remote, remoteCases: inp.remoteCases || 0, adds, deducts, A, B: 0, C, net, unpaid, warn };
}

/** 檢查並整理規則設定；回傳 { config } 或 { error } */
function validateConfig(c) {
  const bad = why => ({ error: 'bad_config', why }), money = v => Number.isFinite(+v) && +v >= 0 && +v <= 1e6;
  if (!c || typeof c !== 'object') return bad('empty');
  if (!Array.isArray(c.rates) || !c.rates.length || c.rates.length > 120) return bad('rates');
  const codes = new Set(), rates = [];
  for (const r of c.rates) {
    if (!r || typeof r.code !== 'string' || !r.code.trim() || r.code.length > 20 ) return bad('rate_code');
    if (typeof r.name !== 'string' || r.name.length > 60 || !['A', 'hA', 'B', 'hB'].every(k => money(r[k]))) return bad('rate_value');
    if (codes.has(r.code + '|' + r.name)) return bad('rate_duplicate'); codes.add(r.code + '|' + r.name); rates.push({ code: r.code, name: r.name, price: money(r.price) ? +r.price : 0, priceN: money(r.priceN) ? +r.priceN : 0, A: +r.A, hA: +r.hA, B: +r.B, hB: +r.hB, lead: money(r.lead) ? +r.lead : 0 });
  }
  if (!Array.isArray(c.bonus) || !c.bonus.length || c.bonus.length > 12) return bad('bonus');
  const bonus = []; let prev = -1;
  for (const b of c.bonus) { if (!Array.isArray(b) || b.length !== 3 || !b.every(money) || +b[0] > +b[1] || +b[0] <= prev) return bad('bonus_bracket'); prev = +b[1]; bonus.push([+b[0], +b[1], +b[2]]); }
  if (!c.remote || !money(c.remote.allow)) return bad('remote');
  if (!Array.isArray(c.extras) || c.extras.length !== EXTRAS.length) return bad('extras');
  const extras = EXTRAS.map((d, i) => { const e = c.extras[i]; return e && e.k === d.k && ['add', 'deduct'].includes(e.kind) ? { ...d, kind: e.kind } : null; });   // 代碼與名稱固定，只能改加項或扣項
  if (extras.some(x => !x)) return bad('extras_kind');
  return { config: { rates, bonus, remote: { areas: DEFAULT_CONFIG.remote.areas, allow: +c.remote.allow }, extras } };
}

module.exports = { EXTRAS, DEFAULT_CONFIG, pay, bonusOf, validateConfig };
