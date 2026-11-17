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

module.exports = { ORG_NAME, buildSlip };
