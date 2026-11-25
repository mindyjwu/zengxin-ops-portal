/**
 * 牛津居家時薪制薪資單（照現有「居服員薪資條」的排版與順序）。純函式：輸入一個人這個月的輸入與計算結果，輸出薪資單的結構。
 * 實發 = 應發(A) + 加班費(B) − 代扣(C)。
 */
const ORG_NAME = '牛津樂活事業股份有限公司附設新竹縣私立牛津居家長照機構';

function buildSlip({ month, person, result, rules, version, generatedAt }) {
  const x = result, p = person, trMin = (p.trWd || 0) + (p.trHol || 0) + (p.trNh || 0);
  const earnings = [
    { item: '本薪（平日服務總時數 × 時薪）', minutes: p.regMin, amount: x.base },
    { item: '轉場費（轉場時數 × 轉場時薪）', minutes: trMin, amount: x.transfer },
    { item: 'AA05、AA06、AA11 加給', amount: x.aa },
    { item: '偏鄉加給', amount: p.rural }, { item: '介紹費', amount: p.intro }, { item: '開案費', amount: p.open },
    { item: '其他津貼／獎金', amount: p.other }, { item: '缺工獎勵', amount: p.short }
  ];
  const deductions = [{ item: '勞保費（勞工自負額）', amount: p.labor }, { item: '健保費（勞工自負額）', amount: p.health }, { item: '勞退自提', amount: p.pension }, { item: '其他', amount: p.otherDed }];
  const otMin = x.segs.reduce((a, s) => a + s.min, 0);
  return { org: ORG_NAME, month, empNo: p.empNo, name: p.name, title: '居服員', rate: x.rate, earlyTier: x.early, earnings, totalA: x.A,
    overtime: x.segs.map(s => ({ day: s.day, band: s.band, mult: s.mult, minutes: s.min, amount: s.amt })), totalB: x.B, deductions, totalC: x.C, net: x.net,
    hours: { regular: +(p.regMin / 60).toFixed(2), overtime: +(otMin / 60).toFixed(2), total: +((p.regMin + otMin) / 60).toFixed(2) },
    rules: { id: rules.id, effectiveFrom: rules.effectiveFrom }, version: version || 0, generatedAt: generatedAt || new Date().toISOString(),
    note: '實發 = 應發(A) + 加班費(B) − 代扣(C)。時薪依「正常工時 + 加班工時」（不含轉場）的總分鐘數分級。' };
}

/** 拆帳制薪資單：版型沿用時薪制，「加班」換成「服務項目明細」 */
function buildSplitSlip({ month, person, result, rules, version, generatedAt }) {
  const x = result, p = person;
  const earnings = [{ item: '拆帳薪資（服務項目 × 給付表）', amount: x.itemPay }, { item: `業績獎金（拆帳薪資 ${Math.round(x.itemPay).toLocaleString('en-US')} 元的區間）`, amount: x.bonus },
    { item: `偏鄉津貼（${x.remoteCases} 案）`, amount: x.remote }, ...x.adds.map(a => ({ item: a.item, amount: a.amount }))];
  return { kind: 'split', org: p.org || '（所屬單位尚未設定）', month, empNo: p.empNo, name: p.name, title: '居服員', plan: x.plan, earnings, totalA: x.A,
    services: x.lines.map(l => ({ code: l.code, name: l.name, nWeekday: l.nWeekday, nHoliday: l.nHoliday, price: l.price, holidayPrice: l.holidayPrice, amount: l.amount, unpaid: l.unpaid })),
    totalB: 0, deductions: x.deducts.map(d => ({ item: d.item, amount: d.amount })), totalC: x.C, net: x.net,
    hours: { total: +(((p.minutes || 0)) / 60).toFixed(2) }, rules: { id: rules.id, effectiveFrom: rules.effectiveFrom }, version: version || 0, generatedAt: generatedAt || new Date().toISOString(),
    note: `實發 = 應發（A）− 應扣（C）。方案 ${x.plan}：每個服務項目有固定的計薪金額，平日用「計薪」、休息日與國定假日用「假日總薪」。業績獎金的金額基準待需求端確認。` };
}

module.exports = { ORG_NAME, buildSlip, buildSplitSlip };
