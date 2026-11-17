/* 牛津居家時薪制計薪：結果、匯入、規則。檔案在瀏覽器解析（svc-parse.js），只送計薪需要的分鐘、次數與金額；計算在伺服器。 */
window.ZXViews = window.ZXViews || {};
window.ZXViews.pay = async (ctx, tab) => {
  const { view, h, api, post, fmt, say, msgBox, me, errText } = ctx;
  const P = '/api/pay/hourly', SP = window.SvcParse;
  const money = n => 'NT$' + Math.round(n).toLocaleString('en-US');
  const cur = tab || 'results';
  view.append(h('div', { class: 'tabs' }, ...[['results', '本月結果'], ['import', '匯入'], ['rules', '規則']].filter(t => t[0] !== 'import' || me.canPayEdit).map(([k, t]) => h('a', { href: '#/pay/' + k, 'aria-current': cur === k }, t))));
  const months = (await api(P + '/months')).data || [];
  const tile = (label, value) => h('div', { class: 'tile' }, h('div', { class: 'muted' }, label), h('div', { class: 'big' }, value));
  const monthInput = (id, value, onchange) => { const i = h('input', { id, type: 'month', value }); i.addEventListener('change', () => onchange(i.value)); return i; };
  const put = (url, body) => api(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const thisMonth = () => (months[0] && months[0].month) || new Date().toISOString().slice(0, 7);
  const download = (name, text) => { const a = h('a', { href: URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' })), download: name }); document.body.append(a); a.click(); a.remove(); };
  const csv = rows => rows.map(r => r.map(c => '"' + String(c == null ? '' : c).replace(/"/g, '""') + '"').join(',')).join('\r\n');

  /* ---- 本月結果 ---- */
  async function results() {
    let month = thisMonth(), seq = 0; const holder = h('div'), box = msgBox();
    const draw = async () => {
      const my = ++seq; holder.textContent = '';
      const { ok, data: d, status } = await api(`${P}/results?month=${month}`);
      if (my !== seq) return;                                   // 連續切換月份時，只畫最後一次
      if (!ok) return holder.append(h('div', { class: 'msg ' + (status === 404 ? 'warn' : 'bad') }, status === 404 ? '這個月還沒有資料。' + (me.canPayEdit ? '請到「匯入」。' : '') : errText(d)));
      const tb = h('tbody'), locked = d.status === 'published';
      d.people.forEach(p => { const x = p.result;
        const early = p.onRoster ? (me.canPayEarly && !locked ? h('input', { type: 'checkbox', checked: x.early, 'aria-label': '較早到職 ' + p.empNo, onchange: async e => { const r = await put(`${P}/early/${p.empNo}`, { early: e.target.checked }); if (r.ok) draw(); else say(box, errText(r.data), 'bad'), box.classList.remove('hidden'); } }) : h('span', { class: 'chip' }, x.early ? '是' : '否'))
          : h('span', { class: 'chip warn', title: '名冊裡沒有這個工號，用匯入時的欄位' }, x.early ? '是' : '否');
        tb.append(h('tr', {}, h('td', { class: 'mono' }, p.empNo), h('td', {}, p.name), h('td', {}, early), h('td', { class: 'num' }, (x.judgeMin / 60).toFixed(2)), h('td', { class: 'num' }, x.rate), h('td', { class: 'num' }, money(x.base)), h('td', { class: 'num' }, money(x.transfer)), h('td', { class: 'num' }, money(x.aa)),
          h('td', { class: 'num' }, money(x.manual)), h('td', { class: 'num' }, money(x.A)), h('td', { class: 'num' }, money(x.B)), h('td', { class: 'num' }, money(x.C)), h('td', { class: 'num' }, h('b', {}, money(x.net))), h('td', {}, ...x.warn.map(w => h('span', { class: 'chip ' + (w.crit ? 'bad' : 'warn'), title: w.zh }, '!')), ' ', h('a', { href: `/payslip.html?month=${month}&emp=${encodeURIComponent(p.empNo)}`, target: '_blank', rel: 'noopener' }, '薪資單'))));
        if (x.segs.length) tb.append(h('tr', { class: 'muted' }, h('td'), h('td', { colspan: 13 }, x.segs.map(s => `${s.day}${s.band} ${s.min} 分 × ${s.mult} = ${money(s.amt)}`).join('；'))));
        if (x.warn.length) tb.append(h('tr', {}, h('td'), h('td', { colspan: 13, class: 'muted' }, x.warn.map(w => w.zh).join('；'))));
      });
      const reasonIn = h('input', { id: 'reopenReason', type: 'text', maxlength: '300', placeholder: '退回原因（至少 5 個字）', class: 'wide' }), bar = h('div', { class: 'btnrow' });
      if (me.canPayEdit && !locked) bar.append(h('button', { id: 'payPublish', onclick: async () => { let r = await post(`${P}/publish`, { month }); if (r.status === 409 && r.data.error === 'blocking_warnings') {
        const list = r.data.people.map(x => `${x.empNo} ${x.name}：${x.warn.join('、')}`).join('；');
        if (!window.confirm(`有嚴重提醒：${list}\n\n確定要發布嗎？`)) return; r = await post(`${P}/publish`, { month, acknowledgeWarnings: true }); }
        say(box, r.ok ? `已發布並鎖定（版本 ${r.data.version}），員工現在看得到自己的薪資單。` : errText(r.data), r.ok ? 'ok' : 'bad'); box.classList.remove('hidden'); if (r.ok) draw(); } }, '發布並鎖定'));
      if (me.canPayEdit && locked) bar.append(reasonIn, h('button', { id: 'payReopen', onclick: async () => { const r = await post(`${P}/reopen`, { month, reason: reasonIn.value }); say(box, r.ok ? '已退回，員工看不到這個月了；改完請重新發布。' : errText(r.data), r.ok ? 'ok' : 'bad'); box.classList.remove('hidden'); if (r.ok) draw(); } }, '退回修改'));
      bar.append(h('a', { id: 'printAll', href: `/payslip.html?month=${month}&all=1`, target: '_blank', rel: 'noopener' }, '列印全部薪資單'));
      holder.append(h('div', { class: 'msg ' + (locked ? 'ok' : 'warn') }, locked ? `已發布並鎖定（版本 ${d.version}）：輸入、代扣與算分鐘都不能改，要改請先「退回」。` : '草稿：員工還看不到。'), bar,
        h('div', { class: 'tiles' }, tile('人數', d.people.length), tile('應發 A', money(d.totals.A)), tile('加班費 B', money(d.totals.B)), tile('代扣 C', money(d.totals.C)), tile('實發', money(d.totals.net))),
        h('p', { class: 'muted' }, d.rules.effectiveFrom ? `使用 ${d.rules.effectiveFrom} 起的規則版本。` : '使用預設規則（確認版）。實發 = 應發 A + 加班費 B − 代扣 C；時薪級距用「正常工時＋加班工時」的分鐘數判斷（不含轉場）。'),
        h('div', { class: 'btnrow' }, h('button', { id: 'payCsv', onclick: () => download(`牛津時薪制計薪_${month}.csv`, csv([['工號', '姓名', '較早到職', '判斷工時', '時薪', '本薪', '轉場費', 'AA加給', '人工項目', '應發A', '加班費B', '代扣C', '實發'], ...d.people.map(p => { const x = p.result; return [p.empNo, p.name, x.early ? '是' : '否', (x.judgeMin / 60).toFixed(2), x.rate, x.base, x.transfer, x.aa, x.manual, x.A, x.B, x.C, x.net]; })])) }, '匯出 CSV')),
        h('div', { class: 'tablewrap' }, h('table', {}, h('thead', {}, h('tr', {}, ...['工號', '姓名', '較早到職', '判斷工時', '時薪', '本薪', '轉場費', 'AA', '人工項目', '應發 A', '加班費 B', '代扣 C', '實發', ''].map(t => h('th', {}, t)))), tb)));
    };
    view.append(h('div', { class: 'card' }, h('label', { for: 'pmonth' }, '月份'), monthInput('pmonth', month, v => { if (/^\d{4}-\d{2}$/.test(v)) { month = v; draw(); } })), box, holder);
    await draw();
  }

  /* ---- 匯入 ---- */
  async function importer() {
    if (!me.canPayEdit) return view.append(h('div', { class: 'msg bad' }, errText({ error: 'forbidden' })));
    let month = thisMonth(), cfg = null, pending = null, pendingDed = null; const box = msgBox(), preview = h('div');
    const loadCfg = async () => { cfg = (await api(`${P}/rules?month=${month}`)).data.config; };
    await loadCfg();
    const note = (t, k) => { say(box, t, k); box.classList.remove('hidden'); };
    const commit = h('button', { id: 'payCommit', disabled: true }, '確認匯入'), mode = h('select', { id: 'payMode' }, h('option', { value: 'upsert' }, '只更新檔案裡的人'), h('option', { value: 'replace' }, '整個月換成這份檔案'));
    const readFile = async f => { const buf = await f.arrayBuffer(); return /\.csv$/i.test(f.name) ? SP.csvRead(buf) : SP.xlsxRead(buf, null, false); };
    const show = (rows, extra) => { pending = rows; commit.disabled = !rows.length; preview.textContent = '';
      preview.append(h('p', {}, `讀到 ${rows.length} 人。` + (extra || '') + ` 會寫入 ${month}。`), h('div', { class: 'tablewrap' }, h('table', {}, h('thead', {}, h('tr', {}, ...['工號', '姓名', '平日分鐘', '加班分鐘合計', '轉場分鐘'].map(t => h('th', {}, t)))),
        h('tbody', {}, ...rows.slice(0, 50).map(r => h('tr', {}, h('td', { class: 'mono' }, r.empNo), h('td', {}, r.name), h('td', { class: 'num' }, r.regMin), h('td', { class: 'num' }, r.ot.reduce((a, b) => a + b, 0)), h('td', { class: 'num' }, r.trWd + r.trHol + r.trNh)))))), rows.length > 50 ? h('p', { class: 'muted' }, '只顯示前 50 人。') : null); };
    const guard = fn => async () => { box.classList.add('hidden'); try { await fn(); } catch (e) { note('無法讀取檔案：' + (e.message || '格式不對'), 'bad'); } };
    const f1 = h('input', { id: 'payFile', type: 'file', accept: '.xlsx,.xlsm,.csv' }), f2 = h('input', { id: 'paySlip', type: 'file', accept: '.xlsx,.xlsm' }), f3 = h('input', { id: 'payDed', type: 'file', accept: '.xlsx,.xlsm,.csv' });
    f1.addEventListener('change', guard(async () => { const g = SP.oxFromFlat(await readFile(f1.files[0]), cfg); if (g.err) return note(g.err, 'bad'); show(g.rows, g.missing.length ? `（範本沒有這些欄位，當成 0：${g.missing.slice(0, 5).join('、')}${g.missing.length > 5 ? '…' : ''}）` : ''); }));
    f2.addEventListener('change', guard(async () => { const g = SP.oxFromSlips(await SP.xlsxRead(await f2.files[0].arrayBuffer(), null, true)); if (!g.rows.length) return note('找不到居服員工作表（工作表名稱或 B2 要像「OXHR001 姓名」）。', 'bad'); show(g.rows, g.note.join(' ')); }));
    f3.addEventListener('change', guard(async () => { const g = SP.oxDeductions(await readFile(f3.files[0])); if (g.err) return note(g.err, 'bad'); pendingDed = g.rows; pending = null; preview.textContent = ''; preview.append(h('p', {}, `代扣表讀到 ${g.rows.length} 人，按「確認匯入」更新 ${month} 名單裡的人。`)); commit.disabled = false; }));
    commit.addEventListener('click', async () => { commit.disabled = true;
      if (pending) { const r = await post(`${P}/rows`, { month, mode: mode.value, rows: pending }); note(r.ok ? `已匯入 ${r.data.people} 人（${month}）。` : errText(r.data) + (r.data && r.data.empNo ? ` 工號：${r.data.empNo}` : ''), r.ok ? 'ok' : 'bad'); if (r.ok) { pending = null; preview.textContent = ''; } else commit.disabled = false; }
      else if (pendingDed) { const r = await put(`${P}/deductions`, { month, rows: pendingDed }); note(r.ok ? `代扣已更新 ${r.data.updated} 人。` + (r.data.missing.length ? `名單裡沒有這些工號：${r.data.missing.slice(0, 8).join('、')}` : '') : errText(r.data), r.ok ? (r.data.missing.length ? 'warn' : 'ok') : 'bad'); if (r.ok) { pendingDed = null; preview.textContent = ''; } else commit.disabled = false; } });
    const tpl = h('button', { id: 'payTpl', onclick: () => { const cols = SP.oxCols(cfg), ex = SP.oxBlank(); ex.empNo = 'OXHR901'; ex.name = '示範（虛構）'; ex.regMin = 6000; ex.trWd = 1200;
      download('牛津時薪制匯入範本.csv', csv([cols.map(c => c[1]), cols.map(([k]) => k === 'early' ? '否' : /^ot\d+$/.test(k) ? 0 : ex[k])])); } }, '下載範本（CSV）');
    /* 從仁寶服務紀錄算分鐘數：日別看仁寶「加班類型」欄，一天的小時＝當天所有服務分鐘加總依序切；轉場分鐘仍照薪資報表匯入 */
    const svcBox = msgBox(), svcOut = h('div'), withAA = h('input', { id: 'svcAA', type: 'checkbox' });
    const DT = { weekday: '平日', national: '國定假日', rest: '休息日', statutory: '例假日' };
    let lastPreview = null;
    const svcNote = (t, k) => { say(svcBox, t, k); svcBox.classList.remove('hidden'); };
    const previewSvc = async () => {
      svcBox.classList.add('hidden'); svcOut.textContent = '';
      const { ok, data: d } = await api(`${P}/from-svc?month=${month}&withAA=${withAA.checked ? 1 : 0}`);
      if (!ok) return svcNote(errText(d), 'warn');
      lastPreview = d; const sum = (p, from, to) => p.ot.slice(from, to).reduce((a, b) => a + b, 0), tb = h('tbody');
      d.people.forEach(p => {
        const m = p.match, inp = h('input', { type: 'text', class: 'sm', placeholder: '員編', 'aria-label': '指定員編 ' + p.worker });
        const who = m.empNo ? h('span', { class: 'chip ok' }, (m.status === 'mapped' ? '已指定 ' : '') + m.empNo) : h('span', {}, h('span', { class: 'chip warn' }, m.status === 'ambiguous' ? '同名多人' : '對不到名冊'), ' ', inp, ' ', h('button', { class: 'mini', onclick: async () => { const r = await put(`${P}/name-map`, { worker: p.worker, empNo: inp.value.trim() }); if (r.ok) previewSvc(); else svcNote(errText(r.data), 'bad'); } }, '指定'));
        const warn = [...(p.over.length ? [`超過 12 小時的分鐘不計：${p.over.map(o => o.day.slice(5) + ' ' + o.minutes + ' 分').join('、')}`] : []), ...(p.mixed.length ? [`同一天有多種日別（以特別的日別為準）：${p.mixed.map(o => o.day.slice(5)).join('、')}`] : [])];
        tb.append(h('tr', {}, h('td', {}, p.worker), h('td', {}, who), h('td', { class: 'num' }, p.regMin), h('td', { class: 'num' }, sum(p, 0, 2)), h('td', { class: 'num' }, sum(p, 2, 6)), h('td', { class: 'num' }, sum(p, 6, 10)), h('td', { class: 'num' }, sum(p, 10, 14)), h('td', { class: 'muted' }, warn.join('；'))));
      });
      svcOut.append(h('p', {}, `${d.people.length} 位居服員；${d.people.filter(p => p.match.empNo).length} 位對得到員編，會寫入 ${month}。`),
        d.unclassified.length ? h('div', { class: 'msg warn' }, h('p', {}, '有「加班類型」標籤系統看不懂，這些分鐘先不計入，請歸類：'), ...d.unclassified.map(u => { const sel = h('select', { 'aria-label': '歸類 ' + u.label }, h('option', { value: '' }, '選日別'), ...Object.entries(DT).map(([v, t]) => h('option', { value: v }, t)));
          return h('div', { class: 'row' }, h('span', {}, `${u.label}（${u.minutes} 分鐘）`), sel, h('button', { class: 'mini', onclick: async () => { if (!sel.value) return; const r = await put(`${P}/daytype-map`, { label: u.label, type: sel.value }); if (r.ok) previewSvc(); else svcNote(errText(r.data), 'bad'); } }, '歸類')); })) : null,
        h('div', { class: 'tablewrap' }, h('table', {}, h('thead', {}, h('tr', {}, ...['仁寶居服員', '員編', '平日服務分鐘（本薪）', '平日加班分鐘', '國定假日加班分鐘', '休息日加班分鐘', '例假日加班分鐘', '提醒'].map(t => h('th', {}, t)))), tb)),
        h('p', { class: 'muted' }, '寫入只更新服務分鐘與加班分鐘（與你勾選的 AA 次數）；轉場、人工項目、代扣、較早到職都保留。國定假日照倍率表全部算加班（「前 13 小時算正常工時」待同事確認）。'),
        h('div', { class: 'btnrow' }, h('button', { id: 'svcWrite', onclick: async () => { const r = await post(`${P}/from-svc`, { month, withAA: withAA.checked }); svcNote(r.ok ? `已寫入 ${r.data.written} 人（${month}）。` + (r.data.skipped.length ? `沒寫入：${r.data.skipped.map(x => x.worker).slice(0, 8).join('、')}（請先指定員編）。` : '') : errText(r.data) + (r.data && r.data.empNo ? ` 員編：${r.data.empNo}` : ''), r.ok ? (r.data.skipped.length ? 'warn' : 'ok') : 'bad'); } }, `寫入 ${month}`)));
    };
    const svcCard = h('section', { class: 'card' }, h('h2', {}, '用仁寶服務紀錄自己算分鐘數'), h('p', { class: 'muted' }, '取代手動匯入分鐘數：日別看仁寶「加班類型」欄；一天的小時＝當天所有服務分鐘加總，平日前 8 小時是本薪、之後第 9–10、11–12 小時加班；休息日、國定假日、例假日從第 0 小時算起。需要先在「仁寶」頁匯入該月的仁寶檔。轉場分鐘仍用上面的方式匯入。'),
      h('div', { class: 'btnrow' }, h('label', {}, withAA, ' 同時帶入 AA05、AA06、AA11 次數（來自仁寶服務項目代碼）'), h('button', { id: 'svcPreview', onclick: previewSvc }, '預覽')), svcBox, svcOut);
    view.append(h('section', { class: 'card' }, h('h2', {}, '匯入計薪資料'), h('p', { class: 'muted' }, '三種來源：範本（Excel 或 CSV）、現有的薪資條活頁簿（每人一個工作表）、代扣表（勞保、健保、勞退自提、其他）。檔案在你的瀏覽器裡讀，不會整份上傳，只送計薪需要的數字。時間單位一律是分鐘。'),
      h('div', { class: 'row' }, h('div', {}, h('label', { for: 'imonth' }, '月份'), monthInput('imonth', month, async v => { if (/^\d{4}-\d{2}$/.test(v)) { month = v; await loadCfg(); } })), h('div', {}, h('label', { for: 'payMode' }, '匯入方式'), mode)),
      h('div', { class: 'btnrow' }, tpl), h('label', { for: 'payFile' }, '範本（Excel／CSV）'), f1, h('label', { for: 'paySlip' }, '現有薪資條活頁簿（.xlsx／.xlsm）'), f2, h('label', { for: 'payDed' }, '代扣表（Excel／CSV）'), f3, box, preview, h('div', { class: 'btnrow' }, commit)));
    view.append(svcCard);
  }

  /* ---- 規則 ---- */
  async function rules() {
    let month = thisMonth(), seq = 0; const holder = h('div'), box = msgBox();
    const draw = async () => {
      const my = ++seq; holder.textContent = '';
      const d = (await api(`${P}/rules?month=${month}`)).data;
      if (my !== seq) return;
      const c = JSON.parse(JSON.stringify(d.config)), ed = d.editable, dis = !ed;
      const n = (get, set, w) => { const i = h('input', { type: 'number', step: 'any', min: '0', value: get() == null ? '' : get(), disabled: dis, class: 'sm' }); i.addEventListener('change', () => set(i.value === '' ? null : +i.value)); return i; };
      const RL = { up: '無條件進位', round: '四捨五入', down: '無條件捨去' };
      const rs = k => { const s = h('select', { disabled: dis }, ...Object.entries(RL).map(([v, t]) => h('option', { value: v }, t))); s.value = c.round[k]; s.addEventListener('change', () => { c.round[k] = s.value; }); return s; };
      const eff = h('input', { id: 'effFrom', type: 'month', value: month });
      holder.append(h('p', { class: 'muted' }, d.effectiveFrom ? `${month} 適用 ${d.effectiveFrom} 起的版本。` : `${month} 沒有自訂版本，使用預設值（確認版）。`) ,
        h('div', { class: 'tablewrap' }, h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, '判斷工時（小時）'), h('th', {}, '較早到職'), h('th', {}, '其他人員'))),
          h('tbody', {}, ...c.tiers.map((t, i) => h('tr', {}, h('td', {}, t.lt == null ? '以上' : ['未滿 ', n(() => t.lt, v => { t.lt = v; })]), h('td', {}, n(() => t.early, v => { t.early = v; })), h('td', {}, n(() => t.other, v => { t.other = v; })))))),
        ), h('div', { class: 'row' }, h('div', {}, h('label', {}, '轉場時薪'), n(() => c.transferRate, v => { c.transferRate = v; })), ...Object.keys(c.aa).map(k => h('div', {}, h('label', {}, k + ' 每次加給'), n(() => c.aa[k], v => { c.aa[k] = v; })))),
        h('div', { class: 'row' }, ...[['base', '本薪'], ['transfer', '轉場費'], ['otSeg', '加班各段'], ['otTotal', '加班合計'], ['net', '實發']].map(([k, t]) => h('div', {}, h('label', {}, t), rs(k)))),
        h('div', { class: 'tablewrap' }, h('table', {}, h('thead', {}, h('tr', {}, ...['日別', '時段', '倍率'].map(t => h('th', {}, t)))), h('tbody', {}, ...c.ot.map(o => h('tr', {}, h('td', {}, o.day), h('td', {}, o.band), h('td', {}, n(() => o.mult, v => { o.mult = v; }))))))),
        ed ? h('div', { class: 'row' }, h('div', {}, h('label', { for: 'effFrom' }, '從哪個月起適用'), eff), h('div', {}, h('button', { id: 'saveRules', onclick: async () => { const r = await put(`${P}/rules`, { effectiveFrom: eff.value, config: c }); say(box, r.ok ? `已儲存，${eff.value} 起適用。舊月份不受影響。` : errText(r.data), r.ok ? 'ok' : 'bad'); box.classList.remove('hidden'); if (r.ok) { month = eff.value; draw(); } } }, '儲存成新版本'))) : h('p', { class: 'muted' }, '只有人資能改規則。'),
        h('h3', {}, '版本紀錄'), d.versions.length ? h('ul', {}, ...d.versions.map(v => h('li', {}, `${v.effective_from} 起 · ${v.created_by} · ${fmt(v.created_at)}`))) : h('p', { class: 'muted' }, '還沒有自訂版本。'));
    };
    view.append(h('div', { class: 'card' }, h('label', { for: 'rmonth' }, '看哪個月適用的規則'), monthInput('rmonth', month, v => { if (/^\d{4}-\d{2}$/.test(v)) { month = v; draw(); } })), box, h('section', { class: 'card' }, h('h2', {}, '牛津時薪制規則'), holder));
    await draw();
  }

  if (cur === 'import') await importer(); else if (cur === 'rules') await rules(); else await results();
};
