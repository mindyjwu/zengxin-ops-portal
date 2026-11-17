/* 薪資單頁：照現有「居服員薪資條」的順序（應發、加班、應扣、實發、總時數）。HR：?month=&emp= 單張、?month=&all=1 全部；員工：?month=&mine=1。列印用瀏覽器（A4）。 */
(async () => {
  const q = new URLSearchParams(location.search), month = q.get('month') || '', box = document.getElementById('slips');
  const h = (tag, cls, ...kids) => { const el = document.createElement(tag); if (cls) el.className = cls; for (const c of kids.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c))); return el; };
  const money = n => 'NT$' + Math.round(n).toLocaleString('en-US');
  document.getElementById('printBtn').addEventListener('click', () => window.print());
  const kind = q.get('kind') === 'split' ? 'split' : 'hourly';
  const url = q.get('mine') ? `/api/payslips/mine/${month}?kind=${kind}` : q.get('all') ? `/api/pay/${kind}/payslips?month=${month}` : `/api/pay/${kind}/payslip?month=${month}&empNo=${encodeURIComponent(q.get('emp') || '')}`;
  const r = await fetch(url); if (r.status === 401) { location.href = '/'; return; }
  const d = await r.json().catch(() => ({}));
  if (!r.ok) { box.append(h('p', 'msg bad', r.status === 404 ? '找不到這張薪資單（還沒發布，或沒有這個月的資料）。' : '你沒有權限看這張薪資單。')); return; }
  const slips = d.slips || [d.slip], draft = !d.published;
  const table = (head, rows, foot) => h('table', 'slipt', h('thead', '', h('tr', '', ...head.map(t => h('th', '', t)))), h('tbody', '', ...rows.map(c => h('tr', '', ...c.map((v, i) => h('td', i === c.length - 1 ? 'num' : '', v))))), foot ? h('tfoot', '', h('tr', '', ...foot.map((v, i) => h('td', i === foot.length - 1 ? 'num' : '', v)))) : null);
  slips.forEach(s => {
    const mins = m => m == null ? '' : `${m} 分（${(m / 60).toFixed(2)} 小時）`;
    box.append(h('section', 'slip', draft ? h('div', 'slipdraft', '草稿（尚未發布，數字可能還會變）') : null,
      h('h1', '', s.org), h('h2', '', `${s.month.replace('-', ' 年 ')} 月 薪資單`),
      h('div', 'slipmeta', h('span', '', '姓名：', h('b', '', s.name)), h('span', '', '工號：', s.empNo), h('span', '', '職稱：', s.title), s.kind === 'split' ? h('span', '', '方案：', h('b', '', s.plan)) : h('span', '', '當月時薪：', h('b', '', `${s.rate} 元`))),
      h('h3', '', '應發項目'), s.kind === 'split' ? table(['項目', '金額'], s.earnings.map(e => [e.item, money(e.amount)]), ['合計（A）', money(s.totalA)]) : table(['項目', '時間', '金額'], s.earnings.map(e => [e.item, mins(e.minutes), money(e.amount)]), ['合計（A）', '', money(s.totalA)]),
      s.kind === 'split'
        ? [h('h3', '', '服務項目明細'), s.services.length ? table(['碼別', '服務項目', '平日次數', '假日次數', '單價（平日／假日）', '金額'], s.services.map(v => [v.code, v.name + (v.unpaid ? '（不在給付表，未計薪）' : ''), String(v.nWeekday), String(v.nHoliday), v.price == null ? '—' : `${v.price} ／ ${v.holidayPrice}`, money(v.amount)])) : h('p', 'muted', '本月沒有服務紀錄。')]
        : [h('h3', '', '加班費'), s.overtime.length ? table(['加班別', '時段', '倍率', '時間', '加班費'], s.overtime.map(o => [o.day, o.band, String(o.mult), mins(o.minutes), money(o.amount)]), ['合計（B）', '', '', '', money(s.totalB)]) : h('p', 'muted', '本月沒有加班。')],
      h('h3', '', '應扣項目'), table(['項目', '金額'], s.deductions.map(e => [e.item, money(e.amount)]), ['合計（C）', money(s.totalC)]),
      h('div', 'slipnet', s.kind === 'split' ? '實發金額 = 應發（A）− 應扣（C）　' : '實發金額 = 應發（A）+ 加班費（B）− 應扣（C）　', h('b', '', money(s.net))),
      h('p', 'slipmeta', s.kind === 'split' ? `本月服務總時數 ${s.hours.total} 小時` : `本月本薪總時數（不含轉場）${s.hours.regular} 小時　本月加班總時數 ${s.hours.overtime} 小時　本月總時數 ${s.hours.total} 小時`),
      h('p', 'muted', s.note), h('p', 'muted', draft ? '' : `已發布（版本 ${s.version}）。`)));
  });
  document.title = `薪資單 ${month}`;
})();
