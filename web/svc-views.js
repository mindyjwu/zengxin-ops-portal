/* 仁寶（居家服務）：儀表板、居服員工時、匯入、拆帳制計薪。資料來自後端 API；解析檔案在瀏覽器（svc-parse.js），只送彙總。 */
window.ZXViews = window.ZXViews || {};
window.ZXViews.svc = async (ctx, tab) => {
  const { view, h, api, post, fmt, hrs, say, msgBox, me, errText } = ctx;
  const NS = 'http://www.w3.org/2000/svg';
  const money = n => 'NT$' + Math.round(n).toLocaleString('en-US');
  const num1 = n => (+n).toLocaleString('en-US', { maximumFractionDigits: 1 });
  const tabs = [['dash', '儀表板', true], ['workers', '居服員工時', true], ['import', '匯入', me.canSvcImport], ['pay', '拆帳制計薪', me.canSvcPay]];
  const cur = tab || 'dash';
  view.append(h('div', { class: 'tabs' }, ...tabs.filter(t => t[2]).map(([k, t]) => h('a', { href: '#/svc/' + k, 'aria-current': cur === k }, t))));

  const months = (await api('/api/svc/months')).data || [];
  const monthSel = (id, onchange, value) => { const s = h('select', { id }, ...months.map(m => h('option', { value: m.month }, m.month))); if (value) s.value = value; s.addEventListener('change', onchange); return s; };
  const noData = () => view.append(h('div', { class: 'card' }, h('p', {}, '還沒有匯入資料。'), me.canSvcImport ? h('p', {}, h('a', { href: '#/svc/import' }, '前往匯入仁寶檔')) : h('p', { class: 'muted' }, '請有匯入權限的同仁先匯入。')));
  const tile = (label, value, sub) => h('div', { class: 'tile' }, h('div', { class: 'muted' }, label), h('div', { class: 'big' }, value), sub ? h('div', { class: 'muted' }, sub) : null);

  /* ---- SVG 長條圖（每日工時）：寬高用屬性，不用行內樣式 ---- */
  const dailyChart = days => {
    const W = 600, H = 140, mx = Math.max(1, ...days.map(d => d.hours)), bw = W / Math.max(days.length, 1);
    const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('class', 'chart'); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', '每日工時長條圖');
    days.forEach((d, i) => {
      const bh = Math.max(2, d.hours / mx * (H - 4)), r = document.createElementNS(NS, 'rect');
      r.setAttribute('x', i * bw + 1); r.setAttribute('y', H - bh); r.setAttribute('width', Math.max(1, bw - 2)); r.setAttribute('height', bh); r.setAttribute('class', 'bar');
      const t = document.createElementNS(NS, 'title'); t.textContent = `${d.day}：${num1(d.hours)} 小時`; r.append(t); svg.append(r);
    });
    return svg;
  };
  const bars = rows => h('div', { class: 'bars' }, ...rows.flatMap(([label, value, max, text]) => [h('span', {}, label), h('progress', { value, max: max || 1, 'aria-label': label }), h('span', { class: 'num' }, text)]));

  /* ---- 儀表板 ---- */
  async function dash() {
    if (!months.length) return noData();
    let month = months[0].month;
    const holder = h('div');
    const draw = async () => {
      holder.textContent = '';
      const { ok, data: d } = await api('/api/svc/dashboard?month=' + month);
      if (!ok) { holder.append(h('div', { class: 'msg bad' }, errText(d))); return; }
      const e = d.exceptions || {}, flag = (l, n) => h('span', { class: 'chip ' + (n ? 'warn' : '') }, `${l}：${n}`);
      const maxItem = Math.max(1, ...d.topItems.map(i => i.hours)), maxB = Math.max(1, ...d.workerBuckets.map(b => b.workers));
      holder.append(
        d.partialMonth ? h('div', { class: 'msg warn' }, `注意：這個月的資料只到 ${d.partialMonth.lastDay}，不是整個月（月底 ${d.partialMonth.endOfMonth}）。人數與工時是到這天為止的累計，不能和整月比。`) : null,
        h('div', { class: 'tiles' }, tile('服務人數', d.cases, '當月實際使用服務的人數'), tile('工時（小時）', num1(d.hours)), tile('居服員', d.workers), tile('每位居服員平均工時', d.avgPerWorker == null ? '—' : num1(d.avgPerWorker)), tile('每位個案平均工時', d.avgPerCase == null ? '—' : num1(d.avgPerCase)), tile('服務紀錄', d.rows)),
        h('section', { class: 'card' }, h('h2', {}, '每日工時（小時）'), dailyChart(d.daily), h('p', { class: 'muted' }, `${d.daily[0] ? d.daily[0].day : ''} ～ ${d.daily.length ? d.daily[d.daily.length - 1].day : ''}`)),
        h('div', { class: 'grid2' },
          h('section', { class: 'card' }, h('h2', {}, '服務項目：工時前 8 名'), bars(d.topItems.map(i => [i.name, i.hours, maxItem, num1(i.hours)]))),
          h('section', { class: 'card' }, h('h2', {}, '居服員工時分布（每人當月小時）'), bars(d.workerBuckets.map(b => [b.to == null ? b.from + '+ 小時' : `${b.from}–${b.to} 小時`, b.workers, maxB, b.workers + ' 位'])))),
        h('section', { class: 'card' }, h('h2', {}, '服務單位'), h('div', { class: 'tablewrap' }, h('table', {}, h('thead', {}, h('tr', {}, ...['服務單位', '服務人數', '工時（小時）', '居服員'].map(t => h('th', {}, t)))),
          h('tbody', {}, ...d.units.map(u => h('tr', {}, h('td', {}, u.unit), h('td', { class: 'num' }, u.cases), h('td', { class: 'num' }, num1(u.hours)), h('td', { class: 'num' }, u.workers))))))),
        h('section', { class: 'card' }, h('h2', {}, '資料品質與異常（整份檔案）'), h('div', { class: 'chips' }, flag('忘簽退', e.noOut || 0), flag('服務未遇', e.noShow || 0), flag('遲到', e.late || 0), flag('時數不足', e.short || 0), flag('服務時間為 0', e.zero || 0)),
          h('p', { class: 'muted' }, '工時＝打卡的服務時間加總；忘簽退與服務未遇先計入（10/20 會議）。個案姓名、身分證字號、案號不會送到伺服器，這裡只有彙總。匯入時間：' + fmt(d.importedAt))));
    };
    view.append(h('div', { class: 'card' }, h('label', { for: 'dmonth' }, '月份'), monthSel('dmonth', e => { month = e.target.value; draw(); }, month)), holder);
    await draw();
  }

  /* ---- 居服員工時 ---- */
  async function workers() {
    if (!months.length) return noData();
    let month = months[0].month, day = months[0].last_day || '';
    const body = h('tbody'), dayIn = h('input', { id: 'wday', type: 'date', value: day });
    const MATCH = { matched: ['已對到員工', 'ok'], ambiguous: ['同名多人，請人工確認', 'warn'], suffix: ['同名同姓（姓名後加「2」），請人工確認', 'warn'], unmatched: ['未對到', ''] };
    const draw = async () => {
      body.textContent = '';
      const { data } = await api(`/api/svc/workers?month=${month}` + (dayIn.value ? '&day=' + dayIn.value : ''));
      (data || []).forEach(w => body.append(h('tr', {}, h('td', {}, w.worker), h('td', { class: 'num' }, w.dayHours == null ? '—' : num1(w.dayHours)), h('td', { class: 'num' }, w.weekHours == null ? '—' : num1(w.weekHours)), h('td', { class: 'num' }, num1(w.hours)), h('td', { class: 'num' }, w.days),
        h('td', {}, h('span', { class: 'chip ' + MATCH[w.match.status][1] }, w.match.status === 'matched' ? '員編 ' + w.match.id : MATCH[w.match.status][0])))));
      if (!(data || []).length) body.append(h('tr', {}, h('td', { colspan: 6, class: 'muted' }, '沒有資料')));
    };
    dayIn.addEventListener('change', draw);
    view.append(h('section', { class: 'card' }, h('div', { class: 'row' }, h('div', {}, h('label', { for: 'wmonth' }, '月份'), monthSel('wmonth', e => { month = e.target.value; draw(); }, month)), h('div', {}, h('label', { for: 'wday' }, '看哪一天／哪一週（週一到週日）'), dayIn)),
      h('div', { class: 'tablewrap' }, h('table', {}, h('thead', {}, h('tr', {}, ...['居服員', '當日', '當週', '當月', '出勤天數', '對照員工'].map(t => h('th', {}, t)))), body)),
      h('p', { class: 'muted' }, '仁寶匯出沒有員工編號，所以用姓名對照員工名單；同名同姓在姓名後加「2」，需要人工確認。')));
    await draw();
  }

  /* ---- 匯入 ---- */
  async function importer() {
    if (!me.canSvcImport) return view.append(h('div', { class: 'msg bad' }, errText({ error: 'forbidden' })));
    const box = msgBox(), preview = h('div'), file = h('input', { id: 'svcFile', type: 'file', accept: '.xlsx,.csv' });
    let pending = null;
    const go = h('button', { id: 'svcCommit', disabled: true }, '確認匯入');
    file.addEventListener('change', async () => {
      pending = null; go.disabled = true; preview.textContent = ''; box.classList.add('hidden');
      const f = file.files[0]; if (!f) return;
      const ext = (f.name.split('.').pop() || '').toLowerCase();
      if (ext !== 'xlsx' && ext !== 'csv') { say(box, '只收 .xlsx 和 .csv（舊版 .xls 請在 Excel 另存成 .xlsx 或 CSV）。', 'bad'); box.classList.remove('hidden'); return; }
      try {
        const buf = await f.arrayBuffer(), rows = ext === 'csv' ? SvcParse.csvRead(buf) : await SvcParse.xlsxRead(buf, /服務紀錄/), g = SvcParse.svcAggregate(rows);
        if (g.fatal) { say(box, '無法匯入：' + g.fatal, 'bad'); box.classList.remove('hidden'); return; }
        pending = SvcParse.toPayload(g, f.name.replace(/[^一-鿿A-Za-z0-9._-]/g, ''));
        const ms = Object.keys(g.mon).sort();
        preview.append(h('div', { class: 'tiles' }, tile('服務紀錄', g.rows), tile('服務人數（整份檔案）', g.cases), tile('居服員', Object.keys(g.who).length), tile('期間', `${g.from} ～ ${g.to}`), tile('月份', ms.join('、'))),
          g.skipped.length ? h('div', { class: 'msg warn' }, `有 ${g.skipped.length} 列缺居服員、日期或時數，沒有計入。`) : null,
          h('p', { class: 'muted' }, `匯入會取代這些月份已有的資料：${ms.join('、')}。個案姓名、身分證字號、案號只在你的瀏覽器裡用來計數，不會送出。`));
        go.disabled = false;
      } catch (e) { say(box, '無法讀取檔案：' + (e.message || '格式不對'), 'bad'); box.classList.remove('hidden'); }
    });
    go.addEventListener('click', async () => {
      if (!pending) return; go.disabled = true;
      const { ok, data } = await post('/api/svc/imports', pending);
      say(box, ok ? '已匯入：' + data.months.join('、') : errText(data), ok ? 'ok' : 'bad'); box.classList.remove('hidden');
      if (ok) { pending = null; preview.textContent = ''; file.value = ''; loadHist(); } else go.disabled = false;
    });
    const hist = h('tbody'), loadHist = async () => { hist.textContent = ''; ((await api('/api/svc/imports')).data || []).forEach(i => hist.append(h('tr', {}, h('td', {}, fmt(i.imported_at)), h('td', {}, i.imported_by), h('td', {}, i.source_name), h('td', {}, `${i.date_from || ''} ～ ${i.date_to || ''}`), h('td', { class: 'num' }, i.rows)))); };
    view.append(h('section', { class: 'card' }, h('h2', {}, '匯入仁寶服務紀錄'),
      h('p', { class: 'muted' }, '接受 .xlsx（可以是整本活頁簿，系統會自動找「服務紀錄」那一頁）與 .csv（UTF-8 或 Big5）。'), h('label', { for: 'svcFile' }, '選擇檔案'), file, box, preview, h('div', { class: 'btnrow' }, go)),
      h('section', { class: 'card' }, h('h2', {}, '匯入紀錄'), h('div', { class: 'tablewrap' }, h('table', {}, h('thead', {}, h('tr', {}, ...['時間', '匯入者', '檔名', '資料期間', '筆數'].map(t => h('th', {}, t)))), hist))));
    await loadHist();
  }

  /* ---- 拆帳制計薪 ---- */
  async function pay() {
    if (!me.canSvcPay) return view.append(h('div', { class: 'msg bad' }, errText({ error: 'forbidden' })));
    if (!months.length) return noData();
    let month = months[0].month, plan = 'A';
    const holder = h('div');
    const draw = async () => {
      holder.textContent = '';
      const { ok, data: d } = await api(`/api/svc/pay?month=${month}&plan=${plan}`);
      if (!ok) { holder.append(h('div', { class: 'msg bad' }, errText(d))); return; }
      const un = Object.entries(d.unmatchedItems || {});
      holder.append(
        h('div', { class: 'msg warn' }, '草稿：只算服務拆帳、業績獎金與偏鄉津貼，未含交通津貼、其他加扣項、勞健保代扣與 AA 碼獎勵金。業績獎金的金額基準（服務金額）待需求端確認。'),
        un.length ? h('div', { class: 'msg warn' }, '有服務碼別不在給付表，沒有計薪：' + un.map(([k, n]) => `${k}（${n} 次）`).join('、')) : null,
        h('div', { class: 'tiles' }, tile('居服員', d.workers.length), tile('服務金額', money(d.totals.billed)), tile('拆帳薪資', money(d.totals.itemPay)), tile('業績獎金', money(d.totals.bonus)), tile('偏鄉津貼', money(d.totals.remote)), tile('合計', money(d.totals.total))),
        h('div', { class: 'tablewrap' }, h('table', {}, h('thead', {}, h('tr', {}, ...['居服員', '服務金額', '拆帳薪資', '業績獎金', '偏鄉津貼', '合計'].map(t => h('th', {}, t)))),
          h('tbody', {}, ...d.workers.map(w => h('tr', {}, h('td', {}, w.worker), h('td', { class: 'num' }, money(w.billed)), h('td', { class: 'num' }, money(w.itemPay)), h('td', { class: 'num' }, money(w.bonus)), h('td', { class: 'num' }, w.remoteCases ? `${money(w.remote)}（${w.remoteCases} 案）` : '—'), h('td', { class: 'num' }, h('b', {}, money(w.total)))))))),
        h('p', { class: 'muted' }, '算法（10/28 給付表）：每個服務項目有固定計薪金額，平日用「計薪」、休息日與國定假日用「假日總薪」；方案 A 是一般居服員，方案 B 是兼居服的日照司機。次數為 0 的紀錄不計。'));
    };
    const plans = h('select', { id: 'pplan' }, h('option', { value: 'A' }, '方案 A（一般居服員）'), h('option', { value: 'B' }, '方案 B（日照司機）'));
    plans.addEventListener('change', e => { plan = e.target.value; draw(); });
    view.append(h('div', { class: 'card' }, h('div', { class: 'row' }, h('div', {}, h('label', { for: 'pmonth' }, '月份'), monthSel('pmonth', e => { month = e.target.value; draw(); }, month)), h('div', {}, h('label', { for: 'pplan' }, '方案'), plans))), holder);
    await draw();
  }

  if (cur === 'workers') await workers(); else if (cur === 'import') await importer(); else if (cur === 'pay') await pay(); else await dash();
};
