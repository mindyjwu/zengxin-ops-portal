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
      const tb = h('tbody');
      d.people.forEach(p => { const x = p.result;
        const early = p.onRoster ? (me.canPayEarly ? h('input', { type: 'checkbox', checked: x.early, 'aria-label': '較早到職 ' + p.empNo, onchange: async e => { const r = await put(`${P}/early/${p.empNo}`, { early: e.target.checked }); if (r.ok) draw(); else say(box, errText(r.data), 'bad'), box.classList.remove('hidden'); } }) : h('span', { class: 'chip' }, x.early ? '是' : '否'))
          : h('span', { class: 'chip warn', title: '名冊裡沒有這個工號，用匯入時的欄位' }, x.early ? '是' : '否');
        tb.append(h('tr', {}, h('td', { class: 'mono' }, p.empNo), h('td', {}, p.name), h('td', {}, early), h('td', { class: 'num' }, (x.judgeMin / 60).toFixed(2)), h('td', { class: 'num' }, x.rate), h('td', { class: 'num' }, money(x.base)), h('td', { class: 'num' }, money(x.transfer)), h('td', { class: 'num' }, money(x.aa)),
          h('td', { class: 'num' }, money(x.manual)), h('td', { class: 'num' }, money(x.A)), h('td', { class: 'num' }, money(x.B)), h('td', { class: 'num' }, money(x.C)), h('td', { class: 'num' }, h('b', {}, money(x.net))), h('td', {}, ...x.warn.map(w => h('span', { class: 'chip ' + (w.crit ? 'bad' : 'warn'), title: w.zh }, '!')))));
        if (x.segs.length) tb.append(h('tr', { class: 'muted' }, h('td'), h('td', { colspan: 13 }, x.segs.map(s => `${s.day}${s.band} ${s.min} 分 × ${s.mult} = ${money(s.amt)}`).join('；'))));
        if (x.warn.length) tb.append(h('tr', {}, h('td'), h('td', { colspan: 13, class: 'muted' }, x.warn.map(w => w.zh).join('；'))));
      });
      holder.append(h('div', { class: 'tiles' }, tile('人數', d.people.length), tile('應發 A', money(d.totals.A)), tile('加班費 B', money(d.totals.B)), tile('代扣 C', money(d.totals.C)), tile('實發', money(d.totals.net))),
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
    view.append(h('section', { class: 'card' }, h('h2', {}, '匯入計薪資料'), h('p', { class: 'muted' }, '三種來源：範本（Excel 或 CSV）、現有的薪資條活頁簿（每人一個工作表）、代扣表（勞保、健保、勞退自提、其他）。檔案在你的瀏覽器裡讀，不會整份上傳，只送計薪需要的數字。時間單位一律是分鐘。'),
      h('div', { class: 'row' }, h('div', {}, h('label', { for: 'imonth' }, '月份'), monthInput('imonth', month, async v => { if (/^\d{4}-\d{2}$/.test(v)) { month = v; await loadCfg(); } })), h('div', {}, h('label', { for: 'payMode' }, '匯入方式'), mode)),
      h('div', { class: 'btnrow' }, tpl), h('label', { for: 'payFile' }, '範本（Excel／CSV）'), f1, h('label', { for: 'paySlip' }, '現有薪資條活頁簿（.xlsx／.xlsm）'), f2, h('label', { for: 'payDed' }, '代扣表（Excel／CSV）'), f3, box, preview, h('div', { class: 'btnrow' }, commit)));
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
