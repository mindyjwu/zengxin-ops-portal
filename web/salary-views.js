/* 月薪制薪資資料：每位同仁的底薪與專業加給（有生效日，只能新增；更正要新增一筆並寫原因）。 */
window.ZXViews = window.ZXViews || {};
window.ZXViews.salary = async (ctx, tab) => {
  const { view, h, api, post, fmt, say, msgBox, me } = ctx;
  const errText = d => d && d.error === 'reason_required' ? '要寫原因（至少 2 個字）。' : ctx.errText(d);   // 退回薪資單的原因是 5 個字，這裡是 2 個字
  const P = '/api/pay/salary', SP = window.SvcParse, cur = tab || 'current';
  const money = n => n == null ? '—' : 'NT$' + Math.round(n).toLocaleString('en-US');
  const WARN = { below_minimum: '低於基本工資 29,500', before_hire: '生效日早於到職日' };
  const KIND = { hire: '到職定薪', raise: '調薪', correction: '更正', import: '匯入' };
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(new Date());
  const download = (name, text) => { const a = h('a', { href: URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' })), download: name }); document.body.append(a); a.click(); a.remove(); };
  const csv = rows => rows.map(r => r.map(c => '"' + String(c == null ? '' : c).replace(/"/g, '""') + '"').join(',')).join('\r\n');
  view.append(h('div', { class: 'tabs' }, ...[['current', '目前薪資'], ['import', '匯入']].filter(t => t[0] !== 'import' || me.canPayEdit).map(([k, t]) => h('a', { href: '#/salary/' + k, 'aria-current': cur === k }, t))));
  const warnChips = ws => ws.map(w => h('span', { class: 'chip warn', title: WARN[w] }, '!'));

  async function current() {
    let asOf = today, q = '', seq = 0; const holder = h('div'), panel = h('div'), box = msgBox();
    const showHistory = async empNo => {
      panel.textContent = '';
      const { ok, data: d } = await api(`${P}/history/${encodeURIComponent(empNo)}`); if (!ok) return panel.append(h('div', { class: 'msg bad' }, errText(d)));
      const tb = h('tbody', {}, ...d.entries.map(e => h('tr', {}, h('td', {}, e.effectiveFrom), h('td', {}, KIND[e.kind] || e.kind), h('td', { class: 'num' }, money(e.base)), h('td', { class: 'num' }, money(e.allowance)), h('td', { class: 'num' }, h('b', {}, money(e.total))), h('td', {}, e.reason), h('td', { class: 'muted' }, `${e.createdBy} · ${fmt(e.createdAt)}`), h('td', {}, d.editable ? h('button', { class: 'mini', onclick: () => fill({ kind: 'correction', correctsId: e.id, date: e.effectiveFrom, base: e.base, allowance: e.allowance }) }, '更正') : null))));
      const f = { kind: h('select', { id: 'sKind' }, h('option', { value: 'raise' }, '調薪'), h('option', { value: 'hire' }, '到職定薪'), h('option', { value: 'correction' }, '更正（新增一筆，不改舊的）')), date: h('input', { id: 'sDate', type: 'date', value: today }), base: h('input', { id: 'sBase', type: 'number', min: '0', step: '1' }), allow: h('input', { id: 'sAllow', type: 'number', min: '0', step: '1', value: '0' }), reason: h('input', { id: 'sReason', type: 'text', maxlength: '300', class: 'wide' }), corrects: null };
      const fill = x => { f.kind.value = x.kind; f.date.value = x.date; f.base.value = x.base; f.allow.value = x.allowance; f.corrects = x.correctsId; f.reason.focus(); };
      panel.append(h('section', { class: 'card' }, h('h2', {}, `${d.name}（${d.empNo}）薪資歷史`), h('p', { class: 'muted' }, '只能新增，不能改或刪；更正就新增一筆更正並寫原因，同一生效日以最新一筆為準。' + (d.hiredAt ? `到職日 ${d.hiredAt}。` : '')),
        h('div', { class: 'tablewrap' }, h('table', {}, h('thead', {}, h('tr', {}, ...['生效日', '類型', '底薪', '專業加給', '合計', '原因', '登錄', ''].map(t => h('th', {}, t)))), tb)),
        d.editable ? h('div', {}, h('h3', {}, '新增一筆'), h('div', { class: 'row' }, h('div', {}, h('label', { for: 'sKind' }, '類型'), f.kind), h('div', {}, h('label', { for: 'sDate' }, '生效日'), f.date), h('div', {}, h('label', { for: 'sBase' }, '底薪'), f.base), h('div', {}, h('label', { for: 'sAllow' }, '專業加給'), f.allow)),
          h('label', { for: 'sReason' }, '原因（必填）'), f.reason, h('div', { class: 'btnrow' }, h('button', { id: 'sSave', onclick: async () => { const r = await post(`${P}/entries`, { empNo: d.empNo, kind: f.kind.value, effectiveFrom: f.date.value, baseSalary: f.base.value, professionalAllowance: f.allow.value, reason: f.reason.value, correctsId: f.kind.value === 'correction' ? f.corrects : undefined });
            say(box, r.ok ? '已新增。' + (r.data.warnings.length ? '提醒：' + r.data.warnings.map(w => WARN[w]).join('、') + '。' : '') : errText(r.data), r.ok ? (r.data.warnings.length ? 'warn' : 'ok') : 'bad'); box.classList.remove('hidden'); if (r.ok) { showHistory(empNo); draw(); } } }, '新增'))) : null));
    };
    const draw = async () => {
      const my = ++seq; holder.textContent = '';
      const { ok, data: d } = await api(`${P}/?asOf=${asOf}`); if (my !== seq) return; if (!ok) return holder.append(h('div', { class: 'msg bad' }, errText(d)));
      const rows = d.people.filter(p => !q || (p.empNo + p.name).toLowerCase().includes(q.toLowerCase()));
      holder.append(d.missing ? h('div', { class: 'msg warn' }, `${d.missing} 位同仁還沒有登錄薪資（月薪制算薪前要補齊）。`) : h('div', { class: 'msg ok' }, '所有在職同仁都有登錄薪資。'),
        h('div', { class: 'tablewrap' }, h('table', {}, h('thead', {}, h('tr', {}, ...['員編', '姓名', '單位', '到職日', '生效日', '底薪', '專業加給', '合計', ''].map(t => h('th', {}, t)))),
          h('tbody', {}, ...rows.map(p => h('tr', {}, h('td', { class: 'mono' }, p.empNo), h('td', {}, p.name), h('td', {}, p.unit || ''), h('td', {}, p.hiredAt || ''), h('td', {}, p.effectiveFrom || '—'), h('td', { class: 'num' }, money(p.base)), h('td', { class: 'num' }, money(p.allowance)), h('td', { class: 'num' }, p.hasEntry ? h('b', {}, money(p.total)) : h('span', { class: 'chip warn' }, '未登錄')),
            h('td', {}, ...warnChips(p.warnings), ' ', h('button', { class: 'mini', 'aria-label': '歷史 ' + p.empNo, onclick: () => showHistory(p.empNo) }, '歷史')))))))); };
    const dateIn = h('input', { id: 'asOf', type: 'date', value: asOf }), search = h('input', { id: 'sSearch', type: 'search', placeholder: '員編或姓名' });
    dateIn.addEventListener('change', () => { if (dateIn.value) { asOf = dateIn.value; draw(); } }); search.addEventListener('input', () => { q = search.value; draw(); });
    view.append(h('div', { class: 'card' }, h('div', { class: 'row' }, h('div', {}, h('label', { for: 'asOf' }, '看哪一天適用的薪資'), dateIn), h('div', {}, h('label', { for: 'sSearch' }, '搜尋'), search))), box, holder, panel);
    await draw();
  }

  async function importer() {
    if (!me.canPayEdit) return view.append(h('div', { class: 'msg bad' }, errText({ error: 'forbidden' })));
    let pending = null; const box = msgBox(), preview = h('div'), reason = h('input', { id: 'impReason', type: 'text', maxlength: '300', class: 'wide', placeholder: '例如：2026 年度調薪' }), commit = h('button', { id: 'salCommit', disabled: true }, '確認匯入'), file = h('input', { id: 'salFile', type: 'file', accept: '.xlsx,.xlsm,.csv' });
    const note = (t, k) => { say(box, t, k); box.classList.remove('hidden'); };
    file.addEventListener('change', async () => { box.classList.add('hidden'); pending = null; commit.disabled = true; preview.textContent = '';
      try { const f = file.files[0], buf = await f.arrayBuffer(), g = SP.salaryFromFlat(/\.csv$/i.test(f.name) ? SP.csvRead(buf) : await SP.xlsxRead(buf, null, false)); if (g.err) return note(g.err, 'bad');
        pending = g.rows; commit.disabled = !g.rows.length; preview.append(h('p', {}, `讀到 ${g.rows.length} 列。整份檔案一起成功或一起失敗；和該日已適用的金額一樣的列會略過。`), h('div', { class: 'tablewrap' }, h('table', {}, h('thead', {}, h('tr', {}, ...SP.SALARY_COLS.map(t => h('th', {}, t)))), h('tbody', {}, ...g.rows.slice(0, 50).map(r => h('tr', {}, h('td', { class: 'mono' }, r.empNo), h('td', {}, r.effectiveFrom), h('td', { class: 'num' }, r.baseSalary), h('td', { class: 'num' }, r.professionalAllowance))))))); }
      catch (e) { note('無法讀取檔案：' + (e.message || '格式不對'), 'bad'); } });
    commit.addEventListener('click', async () => { if (!pending) return; commit.disabled = true; const r = await post(`${P}/import`, { rows: pending, reason: reason.value });
      if (r.ok) { note(`已新增 ${r.data.added} 筆，略過 ${r.data.unchanged} 筆（金額沒變）。` + (r.data.warnings.length ? `提醒：${r.data.warnings.slice(0, 6).map(w => w.empNo + ' ' + w.codes.map(c => WARN[c]).join('、')).join('；')}。` : ''), r.data.warnings.length ? 'warn' : 'ok'); pending = null; preview.textContent = ''; }
      else { note(errText(r.data) + (r.data.empNos ? ` 名冊裡沒有：${r.data.empNos.slice(0, 8).join('、')}` : '') + (r.data.empNo ? ` 員編：${r.data.empNo}` : '') + (r.data.why ? `（${r.data.why}）` : ''), 'bad'); commit.disabled = false; } });
    view.append(h('section', { class: 'card' }, h('h2', {}, '匯入底薪與專業加給'), h('p', { class: 'muted' }, '每一列是一筆：員工編號（要在員工名冊裡）、生效日、底薪、專業加給。歷史只加不改不刪；打錯了到「目前薪資」那位同仁的歷史新增一筆更正。薪資是敏感資料，檔案在你的瀏覽器裡讀，確認後才送出。'),
      h('div', { class: 'btnrow' }, h('button', { id: 'salTpl', onclick: () => download('月薪制薪資範本.csv', csv([SP.SALARY_COLS, ['J020003', '2026-10-16', 32000, 2500]])) }, '下載範本（CSV）')),
      h('label', { for: 'impReason' }, '說明（必填，會記在每一筆）'), reason, h('label', { for: 'salFile' }, '範本（Excel／CSV）'), file, box, preview, h('div', { class: 'btnrow' }, commit)));
  }
  if (cur === 'import') await importer(); else await current();
};
