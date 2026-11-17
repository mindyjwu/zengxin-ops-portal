/**
 * 把仁寶的「每位居服員每天每種加班類型的分鐘」切成時薪制要用的：平日服務分鐘（本薪）與 14 段加班分鐘。
 * 專案負責人 2026-11-17 的決定：日別以仁寶「加班類型」欄為準；一天的小時＝當天所有服務分鐘加總、依序切；
 * 國定假日照倍率表全部算加班（「前 13 小時算正常工時」待同事確認）；轉場分鐘不在這裡（照薪資報表匯入）。
 * 純函式，不碰資料庫。
 */
const BANDS = [[0, 120], [120, 480], [480, 600], [600, 720]];          // 休息日、國定假日、例假日：第 0–2、3–8、9–10、11–12 小時（分鐘）
const OFFSET = { national: 2, rest: 6, statutory: 10 };                // 在 14 段裡的起點（0、1 是平日第 9–10、11–12 小時）
const PRECEDENCE = ['national', 'statutory', 'rest', 'weekday'];       // 同一天有幾種標籤時，以特別的日別為準（並提醒）
const DAYTYPE_ZH = { weekday: '平日', national: '國定假日', rest: '休息日', statutory: '例假日' };

/** 標籤歸類：人資歸類表優先；沒有就用預設規則；看不懂回傳 null（不猜，列出來請人資歸類） */
function classifyLabel(label, table = new Map()) {
  const l = String(label || '').trim();
  if (table.has(l)) return table.get(l);
  if (l === '正常班') return 'weekday';
  if (l.includes('國定')) return 'national';
  if (l.includes('例假')) return 'statutory';
  if (l.includes('休息')) return 'rest';
  if (l.includes('平日')) return 'weekday';
  return null;
}

/** 一天的分鐘依日別切成 { reg, ot[14], over }；over 是超過 12 小時的分鐘（沒有對應倍率，不計入，要提醒） */
function splitDay(type, minutes) {
  const ot = Array(14).fill(0); let reg = 0, over = 0, m = Math.max(0, +minutes || 0);
  if (type === 'weekday') {
    reg = Math.min(m, 480); m -= reg;
    const a = Math.min(m, 120); ot[0] = a; m -= a;
    const b = Math.min(m, 120); ot[1] = b; m -= b;
    over = m;
  } else {
    BANDS.forEach(([from, to], i) => { const t = Math.max(0, Math.min(m, to) - from); ot[OFFSET[type] + i] = t; });
    over = Math.max(0, m - 720);
  }
  return { reg, ot, over };
}

/** 一位居服員一個月：days = { 'YYYY-MM-DD': { 標籤: 分鐘 } } */
function splitMonth(days, table) {
  const out = { reg: 0, ot: Array(14).fill(0), over: [], mixed: [], unclassified: {} };
  for (const [day, labels] of Object.entries(days).sort()) {
    const byType = {}, unmapped = [];
    for (const [label, min] of Object.entries(labels)) {
      const t = classifyLabel(label, table);
      if (!t) { unmapped.push([label, min]); out.unclassified[label] = (out.unclassified[label] || 0) + min; continue; }
      byType[t] = (byType[t] || 0) + min;
    }
    const types = Object.keys(byType); if (!types.length) continue;
    const type = PRECEDENCE.find(t => byType[t] != null), total = types.reduce((a, t) => a + byType[t], 0);
    if (types.length > 1) out.mixed.push({ day, types: types.map(t => DAYTYPE_ZH[t]) });
    const d = splitDay(type, total); out.reg += d.reg; d.ot.forEach((v, i) => { out.ot[i] += v; });
    if (d.over > 0) out.over.push({ day, minutes: d.over });
  }
  out.reg = Math.round(out.reg); out.ot = out.ot.map(v => Math.round(v));                     // 月底才取整數分鐘（四捨五入）
  return out;
}

module.exports = { classifyLabel, splitDay, splitMonth, DAYTYPE_ZH, PRECEDENCE };
