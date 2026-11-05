(async () => {
  const $ = id => document.getElementById(id);
  const show = (el, on) => el.classList.toggle('hidden', !on);
  const J = { 'Content-Type': 'application/json' };
  const api = async (url, opt) => { const r = await fetch(url, opt); return { r, j: await r.json().catch(() => ({})) }; };
  const say = (el, text, kind) => { el.textContent = text; el.className = 'msg ' + (kind || ''); };
  const errText = { email_already_used: '這個 email 已經是別人的帳號。', name_and_valid_email_required: '姓名與 email 都要填。', unknown_unit: '單位不存在。', forbidden: '你沒有這個權限。', role_needs_permission_admin: '只有管理者、系統管理員、老闆可以指定或修改角色。', cannot_change_own_role: '不能修改自己的角色。', cannot_deactivate_self: '不能停用自己。', has_errors: '還有錯誤，沒有匯入任何資料。' };

  const meR = await api('/api/me');
  if (!meR.r.ok) { location.href = '/'; return; }
  const me = meR.j;
  if (!me.canListEmployees) { say($('denied'), '你沒有查看員工名單的權限。', 'bad'); show($('denied'), true); return; }
  const [units, roles] = [(await api('/api/employees/units')).j, (await api('/api/employees/roles')).j];
  const unitName = id => (units.find(u => u.id === id) || {}).name || id;
  const opt = (sel, items, val, label) => { sel.textContent = ''; items.forEach(x => { const o = document.createElement('option'); o.value = val(x); o.textContent = label(x); sel.appendChild(o); }); };
  opt($('aUnit'), units, u => u.id, u => u.id + ' ' + u.name);
  opt($('aRole'), roles, r => r, r => r); $('aRole').value = 'employee';
  show($('aRoleWrap'), me.canChangeRole);
  show($('addBox'), me.canEditEmployees); show($('importBox'), me.canEditEmployees); show($('listBox'), true);

  async function load() {
    const { j } = await api('/api/employees');
    $('count').textContent = j.length + ' 人';
    const tb = $('rows'); tb.textContent = '';
    for (const e of j) {
      const tr = tb.insertRow();
      [e.id, e.name, e.email, e.unit_id].forEach(v => { tr.insertCell().textContent = v; });
      const rc = tr.insertCell();
      if (me.canChangeRole && e.id !== me.id) {
        const s = document.createElement('select'); opt(s, roles, r => r, r => r); s.value = e.role; s.setAttribute('aria-label', '角色 ' + e.name);
        s.addEventListener('change', async () => { const { r, j: out } = await api('/api/employees/' + e.id, { method: 'PATCH', headers: J, body: JSON.stringify({ role: s.value }) }); if (!r.ok) { alert(errText[out.error] || '失敗'); await load(); } });
        rc.appendChild(s);
      } else rc.textContent = e.role;
      const sc = tr.insertCell(), chip = document.createElement('span'); chip.className = 'chip ' + (e.status === 'active' ? 'ok' : 'bad'); chip.textContent = e.status === 'active' ? '在職' : '停用'; sc.appendChild(chip);
      const ac = tr.insertCell();
      if (me.canEditEmployees && e.id !== me.id) {
        const b = document.createElement('button'); b.className = 'ghost'; b.textContent = e.status === 'active' ? '停用' : '啟用';
        b.addEventListener('click', async () => { await api('/api/employees/' + e.id, { method: 'PATCH', headers: J, body: JSON.stringify({ status: e.status === 'active' ? 'inactive' : 'active' }) }); await load(); });
        ac.appendChild(b);
      }
    }
  }
  await load();

  $('addForm').addEventListener('submit', async ev => {
    ev.preventDefault();
    const body = { name: $('aName').value, email: $('aEmail').value, unitId: $('aUnit').value, hiredAt: $('aHired').value || undefined };
    if (me.canChangeRole && $('aRole').value !== 'employee') body.role = $('aRole').value;
    const { r, j } = await api('/api/employees', { method: 'POST', headers: J, body: JSON.stringify(body) });
    if (r.ok) { say($('addMsg'), '已新增，員編 ' + j.id, 'ok'); $('addForm').reset(); $('aRole').value = 'employee'; await load(); } else say($('addMsg'), errText[j.error] || '新增失敗', 'bad');
    show($('addMsg'), true);
  });

  let csvText = '';
  $('csvFile').addEventListener('change', async () => { const f = $('csvFile').files[0]; csvText = f ? await f.text() : ''; $('previewBtn').disabled = !csvText; $('commitBtn').disabled = true; });
  const render = rows => {
    const t = $('previewTbl'), tb = t.tBodies[0]; tb.textContent = ''; show(t, true);
    rows.forEach(o => { const tr = tb.insertRow(); [o.line, o.action === 'new' ? '新增' : o.action === 'update' ? '更新' : '錯誤', o.id || '(自動)', o.name, o.email, o.unitId, o.role, (o.errors || []).join('；')].forEach(v => { tr.insertCell().textContent = v ?? ''; }); });
  };
  $('previewBtn').addEventListener('click', async () => {
    const { r, j } = await api('/api/employees/import', { method: 'POST', headers: J, body: JSON.stringify({ csv: csvText }) });
    if (!r.ok) { say($('importMsg'), j.error === 'missing_columns' ? '缺少欄位：姓名、email、單位代號' : (errText[j.error] || '預覽失敗'), 'bad'); show($('importMsg'), true); return; }
    render(j.rows); say($('importMsg'), `新增 ${j.counts.new}、更新 ${j.counts.update}、錯誤 ${j.counts.error}`, j.counts.error ? 'bad' : 'ok'); show($('importMsg'), true);
    $('commitBtn').disabled = j.counts.error > 0 || (j.counts.new + j.counts.update) === 0;
  });
  $('commitBtn').addEventListener('click', async () => {
    const { r, j } = await api('/api/employees/import', { method: 'POST', headers: J, body: JSON.stringify({ csv: csvText, commit: true }) });
    say($('importMsg'), r.ok ? `已匯入：新增 ${j.counts.new}、更新 ${j.counts.update}` : (errText[j.error] || '匯入失敗'), r.ok ? 'ok' : 'bad'); show($('importMsg'), true);
    $('commitBtn').disabled = true; if (r.ok) await load();
  });
})();
