/* 拆帳制計薪（居服員）：結果、匯入、規則。服務次數與金額來自「仁寶」頁匯入的資料；計算在伺服器。 */
window.ZXViews = window.ZXViews || {};
window.ZXViews.split = async (ctx, tab) => {
  const { view, h, api, post, fmt, say, msgBox, me, errText } = ctx;
  const P = '/api/pay/split', SP = window.SvcParse, cur = tab || 'results';
  const money = n => 'NT$' + Math.round(n).toLocaleString('en-US');
  const put = (url, body) => api(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const tile = (label, value) => h('div', { class: 'tile' }, h('div', { class: 'muted' }, label), h('div', { class: 'big' }, value));
  const monthInput = (id, value, onchange) => { const i = h('input', { id, type: 'month', value }); i.addEventListener('change', () => onchange(i.value)); return i; };
  const download = (name, text) => { const a = h('a', { href: URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' })), download: name }); document.body.append(a); a.click(); a.remove(); };
  const csv = rows => rows.map(r => r.map(c => '"' + String(c == null ? '' : c).replace(/"/g, '""') + '"').join(',')).join('\r\n');
  view.append(h('div', { class: 'tabs' }, ...[['results', '本月結果'], ['import', '匯入'], ['rules', '規則']].filter(t => t[0] !== 'import' || me.canPayEdit).map(([k, t]) => h('a', { href: '#/split/' + k, 'aria-current': cur === k }, t))));
  const months = (await api(P + '/months')).data || [];
  const thisMonth = () => (months[0] && months[0].month) || new Date().toISOString().slice(0, 7);
  const PLAN_SRC = { input: '匯入指定', role: '司機身分', default: '預設' };

  async function results() {
    let month = thisMonth(), seq = 0; const holder = h('div'), box = msgBox();
    const draw = async () => {
      const my = ++seq; holder.textContent = '';
      const { ok, data: d, status } = await api(`${P}/results?month=${month}`);
      if (my !== seq) return;
      if (!ok) return holder.append(h('div', { class: 'msg ' + (status === 404 ? 'warn' : 'bad') }, status === 404 ? '這個月還沒有資料：先到「仁寶」頁匯入仁寶檔，或到「匯入」輸入加扣項。' : errText(d)));
      const locked = d.status === 'published', tb = h('tbody'), sum = k => d.people.reduce((a, p) => a + p.result[k], 0);
      d.people.forEach(p => { const x = p.result;
        tb.append(h('tr', {}, h('td', { class: 'mono' }, p.empNo), h('td', {}, p.name), h('td', {}, h('span', { class: 'chip' }, x.plan), ' ', h('span', { class: 'muted' }, PLAN_SRC[x.planSource] || '')), h('td', { class: 'num' }, money(x.billed)), h('td', { class: 'num' }, money(x.itemPay)), h('td', { class: 'num' }, money(x.bonus)),
          h('td', { class: 'num' }, money(x.remote)), h('td', { class: 'num' }, money(x.adds.reduce((a, e) => a + e.amount, 0))), h('td', { class: 'num' }, money(x.A)), h('td', { class: 'num' }, money(x.C)), h('td', { class: 'num' }, h('b', {}, money(x.net))),
          h('td', {}, ...x.warn.map(w => h('span', { class: 'chip ' + (w.crit ? 'bad' : 'warn'), title: w.zh }, '!')), ' ', h('a', { href: `/payslip.html?kind=split&month=${month}&emp=${encodeURIComponent(p.empNo)}`, target: '_blank', rel: 'noopener' }, '薪資單'))));
        if (x.warn.length) tb.append(h('tr', {}, h('td'), h('td', { colspan: 11, class: 'muted' }, x.warn.map(w => w.zh).join('；'))));
      });
      const reasonIn = h('input', { id: 'reopenReason', type: 'text', maxlength: '300', placeholder: '退回原因（至少 5 個字）', class: 'wide' }), bar = h('div', { class: 'btnrow' });
      if (me.canPayEdit && !locked) bar.append(h('button', { id: 'payPublish', onclick: async () => { let r = await post(`${P}/publish`, { month }); if (r.status === 409 && r.data.error === 'blocking_warnings') {
        if (!window.confirm('有嚴重提醒：' + r.data.people.map(x => `${x.empNo} ${x.name}：${x.warn.join('、')}`).join('；') + '\n\n確定要發布嗎？（對不到員編的居服員不會有薪資單）')) return; r = await post(`${P}/publish`, { month, acknowledgeWarnings: true }); }
        say(box, r.ok ? `已發布並鎖定（版本 ${r.data.version}），員工現在看得到自己的薪資單。` : errText(r.data), r.ok ? 'ok' : 'bad'); box.classList.remove('hidden'); if (r.ok) draw(); } }, '發布並鎖定'));
      if (me.canPayEdit && locked) bar.append(reasonIn, h('button', { id: 'payReopen', onclick: async () => { const r = await post(`${P}/reopen`, { month, reason: reasonIn.value }); say(box, r.ok ? '已退回，員工看不到這個月了；改完請重新發布。' : errText(r.data), r.ok ? 'ok' : 'bad'); box.classList.remove('hidden'); if (r.ok) draw(); } }, '退回修改'));
      bar.append(h('a', { id: 'printAll', href: `/payslip.html?kind=split&month=${month}&all=1`, target: '_blank', rel: 'noopener' }, '列印全部薪資單'));
      const un = d.unmatched || [];
      holder.append(h('div', { class: 'msg ' + (locked ? 'ok' : 'warn') }, locked ? `已發布並鎖定（版本 ${d.version}）：輸入與代扣都不能改，要改請先「退回」。` : '草稿：員工還看不到。業績獎金的金額基準（目前用服務金額）待需求端確認。'), bar,
        un.length ? h('div', { class: 'msg warn' }, h('p', {}, '這些仁寶居服員對不到員工編號，還沒有薪資（先指定員編）：'), ...un.map(u => { const inp = h('input', { type: 'text', class: 'sm', placeholder: '員編', 'aria-label': '指定員編 ' + u.worker });
          return h('div', { class: 'row' }, h('span', {}, `${u.worker}（${u.status === 'ambiguous' ? '同名多人' : '名冊裡沒有'}，估 ${money(u.estimate)}）`), inp, me.canPayEdit ? h('button', { class: 'mini', onclick: async () => { const r = await put('/api/pay/hourly/name-map', { worker: u.worker, empNo: inp.value.trim() }); if (r.ok) draw(); else { say(box, errText(r.data), 'bad'); box.classList.remove('hidden'); } } }, '指定') : null); })) : null,
        h('div', { class: 'tiles' }, tile('人數', d.people.length), tile('拆帳薪資', money(sum('itemPay'))), tile('業績獎金', money(sum('bonus'))), tile('偏鄉津貼', money(sum('remote'))), tile('應發', money(d.totals.A)), tile('代扣', money(d.totals.C)), tile('實發', money(d.totals.net))),
        h('p', { class: 'muted' }, d.rules && d.rules.effectiveFrom ? `使用 ${d.rules.effectiveFrom} 起的規則版本。` : '使用預設規則（10/28 給付表）。'),
        h('div', { class: 'btnrow' }, h('button', { id: 'splitCsv', onclick: () => download(`拆帳制計薪_${month}.csv`, csv([['員編', '姓名', '方案', '服務金額', '拆帳薪資', '業績獎金', '偏鄉津貼', '加項', '應發A', '代扣C', '實發'], ...d.people.map(p => { const x = p.result; return [p.empNo, p.name, x.plan, x.billed, x.itemPay, x.bonus, x.remote, x.adds.reduce((a, e) => a + e.amount, 0), x.A, x.C, x.net]; })])) }, '匯出 CSV')),
        h('div', { class: 'tablewrap' }, h('table', {}, h('thead', {}, h('tr', {}, ...['員編', '姓名', '方案', '服務金額', '拆帳薪資', '業績獎金', '偏鄉津貼', '加項', '應發 A', '代扣 C', '實發', ''].map(t => h('th', {}, t)))), tb)));
    };
    view.append(h('div', { class: 'card' }, h('label', { for: 'smonth' }, '月份'), monthInput('smonth', month, v => { if (/^\d{4}-\d{2}$/.test(v)) { month = v; draw(); } })), box, holder);
    await draw();
  }

  async function importer() {
    if (!me.canPayEdit) return view.append(h('div', { class: 'msg bad' }, errText({ error: 'forbidden' })));
    let month = thisMonth(), extras = null, pending = null, pendingDed = null; const box = msgBox(), preview = h('div');
    const load = async () => { extras = (await api(`${P}/rules?month=${month}`)).data.config.extras; };
    await load();
    const note = (t, k) => { say(box, t, k); box.classList.remove('hidden'); };
    const commit = h('button', { id: 'splitCommit', disabled: true }, '確認匯入'), mode = h('select', { id: 'splitMode' }, h('option', { value: 'upsert' }, '只更新檔案裡的人'), h('option', { value: 'replace' }, '整個月換成這份檔案'));
    const readFile = async f => { const buf = await f.arrayBuffer(); return /\.csv$/i.test(f.name) ? SP.csvRead(buf) : SP.xlsxRead(buf, null, false); };
    const guard = fn => async () => { box.classList.add('hidden'); try { await fn(); } catch (e) { note('無法讀取檔案：' + (e.message || '格式不對'), 'bad'); } };
    const f1 = h('input', { id: 'splitFile', type: 'file', accept: '.xlsx,.xlsm,.csv' }), f2 = h('input', { id: 'splitDed', type: 'file', accept: '.xlsx,.xlsm,.csv' });
    f1.addEventListener('change', guard(async () => { const g = SP.splitFromFlat(await readFile(f1.files[0]), extras); if (g.err) return note(g.err, 'bad'); pending = g.rows; pendingDed = null; commit.disabled = !g.rows.length; preview.textContent = '';
      preview.append(h('p', {}, `讀到 ${g.rows.length} 人，會寫入 ${month}。` + (g.bad.length ? `方案不是 A 或 B 的工號沒有讀進來：${g.bad.slice(0, 6).join('、')}。` : '') + (g.missing.length ? `範本沒有這些欄位，當成 0：${g.missing.slice(0, 5).join('、')}${g.missing.length > 5 ? '…' : ''}。` : '')),
        h('div', { class: 'tablewrap' }, h('table', {}, h('thead', {}, h('tr', {}, ...['工號', '姓名', '方案', '有金額的項目數'].map(t => h('th', {}, t)))), h('tbody', {}, ...g.rows.slice(0, 50).map(r => h('tr', {}, h('td', { class: 'mono' }, r.empNo), h('td', {}, r.name), h('td', {}, r.plan || '依身分'), h('td', { class: 'num' }, Object.keys(r.extras).length))))))); }));
    f2.addEventListener('change', guard(async () => { const g = SP.oxDeductions(await readFile(f2.files[0])); if (g.err) return note(g.err, 'bad'); pendingDed = g.rows; pending = null; commit.disabled = false; preview.textContent = ''; preview.append(h('p', {}, `代扣表讀到 ${g.rows.length} 人，按「確認匯入」更新 ${month} 的勞保、健保、勞退自提、其他代扣。`)); }));
    commit.addEventListener('click', async () => { commit.disabled = true;
      if (pending) { const r = await post(`${P}/rows`, { month, mode: mode.value, rows: pending }); note(r.ok ? `已匯入 ${r.data.people} 人（${month}）。` : errText(r.data) + (r.data && r.data.empNo ? ` 工號：${r.data.empNo}` : ''), r.ok ? 'ok' : 'bad'); if (r.ok) { pending = null; preview.textContent = ''; } else commit.disabled = false; }
      else if (pendingDed) { const r = await put(`${P}/deductions`, { month, rows: pendingDed }); note(r.ok ? `代扣已更新 ${r.data.updated} 人。` + (r.data.missing.length ? `名冊裡與仁寶都找不到這些工號：${r.data.missing.slice(0, 8).join('、')}` : '') : errText(r.data), r.ok ? (r.data.missing.length ? 'warn' : 'ok') : 'bad'); if (r.ok) { pendingDed = null; preview.textContent = ''; } else commit.disabled = false; } });
    const tpl = h('button', { id: 'splitTpl', onclick: () => { const cols = SP.splitCols(extras); download('拆帳制匯入範本.csv', csv([cols.map(c => c[1]), cols.map(([k]) => k === 'empNo' ? 'J020022' : k === 'name' ? '示範（虛構）' : k === 'plan' ? '' : 0)])); } }, '下載範本（CSV）');
    view.append(h('section', { class: 'card' }, h('h2', {}, '匯入拆帳制每月輸入'),
      h('p', { class: 'muted' }, '服務次數與金額來自「仁寶」頁匯入的資料，這裡只輸入方案（A 一般居服員、B 日照司機；空白＝依身分）與各項加項、扣項（交通津貼、AA 碼獎勵金、介紹費、開案費、組長津貼、強制執行、責任險等）。代扣表（勞保、健保、勞退自提、其他）可另外匯入。哪些項目是加項、哪些是扣項，看「規則」頁。'),
      h('div', { class: 'row' }, h('div', {}, h('label', { for: 'imonth' }, '月份'), monthInput('imonth', month, async v => { if (/^\d{4}-\d{2}$/.test(v)) { month = v; await load(); } })), h('div', {}, h('label', { for: 'splitMode' }, '匯入方式'), mode)),
      h('div', { class: 'btnrow' }, tpl), h('label', { for: 'splitFile' }, '範本（Excel／CSV）'), f1, h('label', { for: 'splitDed' }, '代扣表（Excel／CSV）'), f2, box, preview, h('div', { class: 'btnrow' }, commit)));
  }

  async function rules() {
    let month = thisMonth(), seq = 0; const holder = h('div'), box = msgBox();
    const draw = async () => {
      const my = ++seq; holder.textContent = '';
      const d = (await api(`${P}/rules?month=${month}`)).data; if (my !== seq) return;
      const c = JSON.parse(JSON.stringify(d.config)), ed = d.editable;
      const n = (get, set) => { const i = h('input', { type: 'number', step: 'any', min: '0', value: get(), disabled: !ed, class: 'sm' }); i.addEventListener('change', () => set(+i.value)); return i; };
      const eff = h('input', { id: 'effFrom', type: 'month', value: month });
      holder.append(h('p', { class: 'muted' }, d.effectiveFrom ? `${month} 適用 ${d.effectiveFrom} 起的版本。` : `${month} 沒有自訂版本，使用預設值（10/28 給付表）。`),
        h('h3', {}, '業績獎金（依當月服務金額區間）'), h('div', { class: 'tablewrap' }, h('table', {}, h('thead', {}, h('tr', {}, ...['從', '到', '獎金'].map(t => h('th', {}, t)))), h('tbody', {}, ...c.bonus.map(b => h('tr', {}, h('td', {}, n(() => b[0], v => { b[0] = v; })), h('td', {}, n(() => b[1], v => { b[1] = v; })), h('td', {}, n(() => b[2], v => { b[2] = v; }))))))),
        h('div', { class: 'row' }, h('div', {}, h('label', {}, '偏鄉津貼（每案每月）'), n(() => c.remote.allow, v => { c.remote.allow = v; })), h('div', {}, h('p', { class: 'muted' }, '偏鄉區域：' + c.remote.areas.join('、') + '（匯入仁寶檔時判斷，在程式裡固定）'))),
        h('h3', {}, '加項或扣項'), h('div', { class: 'tablewrap' }, h('table', {}, h('thead', {}, h('tr', {}, ...['項目', '加項或扣項'].map(t => h('th', {}, t)))), h('tbody', {}, ...c.extras.map(e => { const s = h('select', { disabled: !ed }, h('option', { value: 'add' }, '加項'), h('option', { value: 'deduct' }, '扣項')); s.value = e.kind; s.addEventListener('change', () => { e.kind = s.value; });
          return h('tr', {}, h('td', {}, e.label + (e.pending ? '（待確認）' : '')), h('td', {}, s)); })))),
        h('h3', {}, `給付表（${c.rates.length} 項；每項的計薪金額）`), h('div', { class: 'tablewrap' }, h('table', {}, h('thead', {}, h('tr', {}, ...['碼別', '服務項目', '計薪 A', '假日總薪 A', '計薪 B', '假日總薪 B'].map(t => h('th', {}, t)))), h('tbody', {}, ...c.rates.map(r => h('tr', {}, h('td', { class: 'mono' }, r.code), h('td', {}, r.name), h('td', {}, n(() => r.A, v => { r.A = v; })), h('td', {}, n(() => r.hA, v => { r.hA = v; })), h('td', {}, n(() => r.B, v => { r.B = v; })), h('td', {}, n(() => r.hB, v => { r.hB = v; }))))))),
        ed ? h('div', { class: 'row' }, h('div', {}, h('label', { for: 'effFrom' }, '從哪個月起適用'), eff), h('div', {}, h('button', { id: 'saveRules', onclick: async () => { const r = await put(`${P}/rules`, { effectiveFrom: eff.value, config: c }); say(box, r.ok ? `已儲存，${eff.value} 起適用。舊月份不受影響。` : errText(r.data), r.ok ? 'ok' : 'bad'); box.classList.remove('hidden'); if (r.ok) { month = eff.value; draw(); } } }, '儲存成新版本'))) : h('p', { class: 'muted' }, '只有人資能改規則。'),
        h('h3', {}, '版本紀錄'), d.versions.length ? h('ul', {}, ...d.versions.map(v => h('li', {}, `${v.effective_from} 起 · ${v.created_by} · ${fmt(v.created_at)}`))) : h('p', { class: 'muted' }, '還沒有自訂版本。'));
    };
    view.append(h('div', { class: 'card' }, h('label', { for: 'rmonth' }, '看哪個月適用的規則'), monthInput('rmonth', month, v => { if (/^\d{4}-\d{2}$/.test(v)) { month = v; draw(); } })), box, h('section', { class: 'card' }, h('h2', {}, '拆帳制規則'), holder));
    await draw();
  }
  if (cur === 'import') await importer(); else if (cur === 'rules') await rules(); else await results();
};
