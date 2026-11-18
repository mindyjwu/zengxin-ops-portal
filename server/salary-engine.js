/**
 * 月薪制薪資資料：某一天適用的底薪與專業加給（生效日精確到日），以及某個月內的分段（月中調薪可按天數分攤）。純函式。
 * 規則：生效日 ≤ 該日的所有紀錄裡，取生效日最晚的；同一生效日有好幾筆（更正）時，以最新一筆（id 最大）為準。
 */
const MIN_MONTHLY = 29500;                                  // 2026 基本工資（全職）

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const isValidDate = s => { if (!DAY.test(s)) return false; const d = new Date(s + 'T00:00:00Z'); return !Number.isNaN(+d) && d.toISOString().slice(0, 10) === s; };
const total = e => (e ? e.base + e.allowance : 0);

/** entries：[{ id, effectiveFrom: 'YYYY-MM-DD', base, allowance }]（順序不拘） */
function salaryOn(entries, date) {
  let best = null;
  for (const e of entries) { if (e.effectiveFrom > date) continue; if (!best || e.effectiveFrom > best.effectiveFrom || (e.effectiveFrom === best.effectiveFrom && e.id > best.id)) best = e; }
  return best;
}

/** 某個月（'YYYY-MM'）內，金額相同的連續日子合成一段：[{ from, to, days, base, allowance }]；月初還沒有任何紀錄的日子 base 與 allowance 是 null */
function segmentsForMonth(entries, month) {
  const [y, m] = month.split('-').map(Number), n = new Date(Date.UTC(y, m, 0)).getUTCDate(), out = [];
  for (let d = 1; d <= n; d++) {
    const day = `${month}-${String(d).padStart(2, '0')}`, e = salaryOn(entries, day), base = e ? e.base : null, allowance = e ? e.allowance : null, last = out[out.length - 1];
    if (last && last.base === base && last.allowance === allowance) { last.to = day; last.days++; } else out.push({ from: day, to: day, days: 1, base, allowance });
  }
  return out;
}

module.exports = { MIN_MONTHLY, isValidDate, salaryOn, segmentsForMonth, total };
