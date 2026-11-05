/* 誠馨入口（連後端版）：單頁應用，資料全部來自伺服器 API。沒有行內腳本與樣式（內容安全政策）。 */
(async () => {
  const view = document.getElementById('view');
  const J = { 'Content-Type': 'application/json' };

  /* ---------- 小工具 ---------- */
  const api = async (url, opt) => { const r = await fetch(url, opt); let data = null; try { data = await r.json(); } catch (_) { /* 沒有內容 */ } return { ok: r.ok, status: r.status, data }; };
  const post = (url, body) => api(url, { method: 'POST', headers: J, body: JSON.stringify(body || {}) });
  const h = (tag, attrs, ...kids) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) { if (v === false || v == null) continue; if (k === 'class') el.className = v; else if (k.startsWith('on')) el.addEventListener(k.slice(2), v); else el.setAttribute(k, v === true ? '' : v); }
    for (const c of kids.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
    return el;
  };
  const TZ = 'Asia/Taipei';
  const fmt = iso => iso ? new Intl.DateTimeFormat('zh-TW', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso)).replace(/\//g, '-') : '';
  const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
  const hrs = n => (+n).toFixed(1).replace(/\.0$/, '');
  const STATUS = { pending: ['待主管簽核', 'warn'], countersign: ['待人資複核', 'info'], approved: ['已核准', 'ok'], rejected: ['已駁回', 'bad'], cancelled: ['已銷假', ''], withdrawn: ['已抽單', ''] };
  const KIND = { leave: '請假', overtime: '加班', punch_fix: '補打卡' };
  const chip = s => h('span', { class: 'chip ' + (STATUS[s] || ['', ''])[1] }, (STATUS[s] || [s])[0]);
  const ERR = {
    bad_period: '起訖時間不對。', hours_must_be_positive_half_hours: '時數要大於 0，而且是 0.5 小時為單位。', hours_exceed_period: '請假時數超過起訖時間。', unknown_leave_type: '假別不存在。',
    leave_type_for_designated_staff_only: '這個假別只有指定員工可以使用。', exceeds_per_event_limit: '超過每次事件的上限。', quota_exceeded: '超過額度。', leave_overlaps: '這段時間已經有請假申請。',
    bad_date_or_time: '日期或時間格式不對。', comp_must_be_pay_or_comp: '請選擇換加班費或補休。', hours_must_be_half_hours_up_to_12: '加班時數要是 0.5 小時為單位，最多 12 小時。', hours_exceed_time_range: '加班時數超過起訖時間。',
    monthly_overtime_cap: '本月加班已超過上限（46 小時）。', cannot_fix_the_future: '不能補未來的打卡。', bad_kind: '請選擇上班或下班。', forbidden: '你沒有這個權限。', not_found: '找不到。', not_open: '這張單已經處理過了。',
    reject_needs_reason: '駁回要寫理由。', only_approved_can_be_cancelled: '只有已核准的才能銷假。', login_required: '請重新登入。', server_error: '伺服器出錯，請稍後再試。'
  };
  const errText = (d) => { const base = ERR[d && d.error] || '失敗，請再試一次。'; return d && d.error === 'quota_exceeded' ? `${base}剩 ${hrs(d.left)} 小時，你申請 ${hrs(d.requested)} 小時。` : d && d.limitHours ? `${base}上限 ${hrs(d.limitHours)} 小時。` : base; };
  const msgBox = () => h('div', { class: 'msg hidden', role: 'status' });
  const say = (box, text, kind) => { box.textContent = text; box.className = 'msg ' + (kind || ''); };

  /* ---------- 登入狀態與選單 ---------- */
  const meR = await api('/api/me');
  if (!meR.ok) { location.href = '/'; return; }
  const me = meR.data;
  document.getElementById('who').textContent = `${me.name}（${me.id}）`;
  let inboxCount = 0;
  const nav = document.getElementById('nav');
  async function drawNav(current) {
    inboxCount = (await api('/api/requests/inbox')).data?.length || 0;
    nav.textContent = '';
    const link = (text, href, extra) => h('a', { href, 'aria-current': current === href ? 'page' : false }, text, extra);
    nav.append(link('首頁', '#/home'), link('申請', '#/apply/leave'), link('我的申請', '#/mine'),
      link('待我簽核', '#/inbox', inboxCount ? h('span', { class: 'badge', 'aria-label': inboxCount + ' 件待簽' }, inboxCount) : null));
    if (me.canListEmployees) nav.append(h('a', { href: '/admin.html' }, '員工管理'));
    if (me.canSeeAudit) nav.append(link('稽核紀錄', '#/audit'));
    nav.append(h('a', { href: '#', onclick: async e => { e.preventDefault(); await post('/auth/logout'); location.href = '/'; } }, '登出'));
  }

  /* ---------- 首頁：打卡、餘額、待辦 ---------- */
  async function home() {
    const box = msgBox();
    const punchList = h('tbody');
    const loadPunches = async () => {
      const { data } = await api('/api/punches'); punchList.textContent = '';
      (data || []).slice(0, 6).forEach(p => punchList.append(h('tr', {}, h('td', {}, p.kind === 'in' ? '上班' : '下班'), h('td', {}, fmt(p.at)), h('td', {}, p.offline_queued ? '離線補傳' : ''))));
      if (!(data || []).length) punchList.append(h('tr', {}, h('td', { colspan: 3, class: 'muted' }, '還沒有打卡紀錄')));
    };
    const punch = async kind => {
      const { ok, data } = await post('/api/punch', { kind, clientAt: new Date().toISOString() });
      if (ok) { say(box, (kind === 'in' ? '上班' : '下班') + '打卡成功：' + fmt(data.at), 'ok'); await loadPunches(); } else say(box, errText(data), 'bad');
      box.classList.remove('hidden');
    };
    const balBody = h('tbody');
    api('/api/leave/balance').then(({ data }) => (data || []).filter(b => ['annual', 'sick', 'personal', 'family', 'menstrual', 'comp'].includes(b.code)).forEach(b =>
      balBody.append(h('tr', {}, h('td', {}, b.name), h('td', { class: 'num' }, b.left == null ? '不設上限' : hrs(b.left) + ' 小時'), h('td', { class: 'num' }, hrs(b.used || 0)), h('td', { class: 'num' }, hrs(b.pending || 0))))));
    const mine = (await api('/api/requests')).data || [];
    const open = mine.filter(r => ['pending', 'countersign'].includes(r.status)).length;
    view.append(h('div', { class: 'grid2' },
      h('section', { class: 'card' }, h('h2', {}, '打卡'),
        h('div', { class: 'btnrow' }, h('button', { id: 'btnIn', onclick: () => punch('in') }, '上班打卡'), h('button', { id: 'btnOut', class: 'ghost', onclick: () => punch('out') }, '下班打卡')),
        box, h('div', { class: 'tablewrap' }, h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, '種類'), h('th', {}, '時間'), h('th', {}, ''))), punchList)),
        h('p', { class: 'muted' }, '打卡位置只有有權限的後台人員看得到，這個畫面不會顯示。')),
      h('section', { class: 'card' }, h('h2', {}, '待辦'),
        h('p', {}, '我的申請處理中：', h('b', {}, open), ' 件'),
        me.canListEmployees || inboxCount ? h('p', {}, '待我簽核：', h('b', {}, inboxCount), ' 件 ', h('a', { href: '#/inbox' }, '前往')) : null,
        h('h2', {}, '假別餘額'), h('div', { class: 'tablewrap' }, h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, '假別'), h('th', {}, '剩餘'), h('th', {}, '已用'), h('th', {}, '待簽'))), balBody)))));
    await loadPunches();
  }

  /* ---------- 申請：請假、加班、補打卡 ---------- */
  const field = (label, input, id) => h('div', {}, h('label', { for: id }, label), input);
  async function apply(kind) {
    const tabs = h('div', { class: 'tabs', role: 'tablist' }, ...[['leave', '請假'], ['overtime', '加班'], ['punchfix', '補打卡']].map(([k, t]) => h('a', { href: '#/apply/' + k, 'aria-current': kind === k })));
    [...tabs.children].forEach((a, i) => { a.textContent = ['請假', '加班', '補打卡'][i]; });
    const box = msgBox(), form = h('form', { class: 'card', id: 'applyForm' });
    const done = (ok, data, okText) => { say(box, ok ? okText : errText(data), ok ? 'ok' : 'bad'); box.classList.remove('hidden'); if (ok) { form.reset(); drawNav(); } };
    if (kind === 'leave') {
      const bal = (await api('/api/leave/balance')).data || [];
      const sel = h('select', { id: 'lType', required: true }, ...bal.map(b => h('option', { value: b.code }, b.name + (b.left != null ? `（剩 ${hrs(b.left)} 小時）` : ''))));
      const d1 = h('input', { id: 'lFrom', type: 'date', required: true, value: today() }), t1 = h('input', { id: 'lFromT', type: 'time', value: '08:00', required: true });
      const d2 = h('input', { id: 'lTo', type: 'date', required: true, value: today() }), t2 = h('input', { id: 'lToT', type: 'time', value: '17:00', required: true });
      const hrsIn = h('input', { id: 'lHours', type: 'number', min: '0.5', step: '0.5', value: '8', required: true });
      const reason = h('textarea', { id: 'lReason', maxlength: '500' });
      const quick = (t, a, b, n) => h('button', { type: 'button', class: 'ghost', onclick: () => { t1.value = a; t2.value = b; hrsIn.value = n; } }, t);
      form.append(h('h2', {}, '請假申請'), h('div', { class: 'row' }, field('假別', sel, 'lType'), field('開始日期', d1, 'lFrom'), field('開始時間', t1, 'lFromT'), field('結束日期', d2, 'lTo'), field('結束時間', t2, 'lToT'), field('請假時數（0.5 小時為單位）', hrsIn, 'lHours')),
        h('div', { class: 'btnrow' }, quick('全天 8 小時', '08:00', '17:00', 8), quick('上午 4 小時', '08:00', '12:00', 4), quick('下午 4 小時', '13:00', '17:00', 4)),
        field('事由', reason, 'lReason'), box, h('button', { type: 'submit' }, '送出申請'));
      form.addEventListener('submit', async e => { e.preventDefault(); const { ok, data } = await post('/api/leave', { leaveType: sel.value, start: `${d1.value}T${t1.value}:00+08:00`, end: `${d2.value}T${t2.value}:00+08:00`, hours: +hrsIn.value, reason: reason.value }); done(ok, data, '已送出：' + (data && data.no) + '，等待主管簽核'); });
    } else if (kind === 'overtime') {
      const d = h('input', { id: 'oDate', type: 'date', required: true, value: today() }), s = h('input', { id: 'oFrom', type: 'time', value: '17:00', required: true }), e2 = h('input', { id: 'oTo', type: 'time', value: '19:00', required: true });
      const hrsIn = h('input', { id: 'oHours', type: 'number', min: '0.5', max: '12', step: '0.5', value: '2', required: true });
      const comp = h('select', { id: 'oComp' }, h('option', { value: 'pay' }, '換加班費'), h('option', { value: 'comp' }, '換補休'));
      const reason = h('textarea', { id: 'oReason', maxlength: '500' });
      const calc = () => { const [a, b] = s.value.split(':').map(Number), [c, dd] = e2.value.split(':').map(Number); const m = (c * 60 + dd) - (a * 60 + b); if (m > 0) hrsIn.value = Math.min(12, Math.floor(m / 30) / 2); };
      s.addEventListener('change', calc); e2.addEventListener('change', calc);
      form.append(h('h2', {}, '加班申請'), h('div', { class: 'row' }, field('加班日期', d, 'oDate'), field('開始時間', s, 'oFrom'), field('結束時間', e2, 'oTo'), field('時數', hrsIn, 'oHours'), field('補償方式', comp, 'oComp')), field('事由', reason, 'oReason'), box, h('button', { type: 'submit' }, '送出申請'));
      form.addEventListener('submit', async ev => { ev.preventDefault(); const { ok, data } = await post('/api/overtime', { workDate: d.value, startTime: s.value, endTime: e2.value, hours: +hrsIn.value, comp: comp.value, reason: reason.value }); done(ok, data, '已送出：' + (data && data.no)); });
    } else {
      const d = h('input', { id: 'fDate', type: 'date', required: true, value: today() }), t = h('input', { id: 'fTime', type: 'time', required: true, value: '08:30' });
      const k = h('select', { id: 'fKind' }, h('option', { value: 'in' }, '上班'), h('option', { value: 'out' }, '下班'));
      const reason = h('textarea', { id: 'fReason', maxlength: '500' });
      form.append(h('h2', {}, '補打卡申請'), h('div', { class: 'row' }, field('日期', d, 'fDate'), field('時間', t, 'fTime'), field('種類', k, 'fKind')), field('事由', reason, 'fReason'), box, h('button', { type: 'submit' }, '送出申請'));
      form.addEventListener('submit', async ev => { ev.preventDefault(); const { ok, data } = await post('/api/punch-fix', { fixDate: d.value, fixTime: t.value, kind: k.value, reason: reason.value }); done(ok, data, '已送出：' + (data && data.no)); });
    }
    view.append(tabs, form);
  }

  /* ---------- 單據清單與詳情 ---------- */
  const summary = r => r.kind === 'leave' ? `${r.leave_type_name || r.leave_type}　${fmt(r.start_at)} ～ ${fmt(r.end_at)}（${hrs(r.hours)} 小時）` : r.kind === 'overtime' ? `${String(r.work_date).slice(0, 10)} ${String(r.start_time).slice(0, 5)}–${String(r.end_time).slice(0, 5)}（${hrs(r.hours)} 小時，${r.comp === 'comp' ? '換補休' : '換加班費'}）` : `${String(r.fix_date).slice(0, 10)} ${String(r.fix_time).slice(0, 5)} ${r.punch_kind === 'in' ? '上班' : '下班'}`;
  const table = (rows, withEmp) => {
    const tb = h('tbody');
    rows.forEach(r => tb.append(h('tr', { class: 'click', tabindex: '0', onclick: () => { location.hash = '#/request/' + r.id; }, onkeydown: e => { if (e.key === 'Enter') location.hash = '#/request/' + r.id; } },
      h('td', {}, r.no), h('td', {}, KIND[r.kind]), withEmp ? h('td', {}, r.empName) : null, h('td', {}, summary(r)), h('td', {}, chip(r.status)))));
    if (!rows.length) tb.append(h('tr', {}, h('td', { colspan: 5, class: 'muted' }, '沒有資料')));
    return h('div', { class: 'tablewrap' }, h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, '單號'), h('th', {}, '類型'), withEmp ? h('th', {}, '申請人') : null, h('th', {}, '內容'), h('th', {}, '狀態'))), tb));
  };
  async function mine() { view.append(h('section', { class: 'card' }, h('h2', {}, '我的申請'), table((await api('/api/requests')).data || [], false))); }
  async function inbox() { view.append(h('section', { class: 'card' }, h('h2', {}, '待我簽核'), table((await api('/api/requests/inbox')).data || [], true))); }

  async function detail(id) {
    const { ok, data: d } = await api('/api/requests/' + id);
    if (!ok) { view.append(h('div', { class: 'msg bad' }, errText(d))); return; }
    const box = msgBox(), comment = h('textarea', { id: 'comment', maxlength: '500', placeholder: '意見（駁回必填）' });
    const act = async (path, needReason) => { if (needReason && !comment.value.trim()) { say(box, ERR.reject_needs_reason, 'bad'); box.classList.remove('hidden'); return; } const r = await post(`/api/requests/${id}/${path}`, { comment: comment.value }); if (r.ok) { await drawNav(); route(); } else { say(box, errText(r.data), 'bad'); box.classList.remove('hidden'); } };
    const open = ['pending', 'countersign'].includes(d.status), isMine = d.empId === me.id;
    const hist = h('tbody', {}, ...d.history.map(x => h('tr', {}, h('td', {}, fmt(x.at)), h('td', {}, x.actor_name), h('td', {}, { applicant: '申請人', manager: '直屬主管', hr: '人資' }[x.step]), h('td', {}, { submit: '送出', approve: '核准', reject: '駁回', withdraw: '抽單', cancel: '銷假' }[x.action]), h('td', {}, x.comment || ''))));
    view.append(h('section', { class: 'card' }, h('h2', {}, `${d.no}　${KIND[d.kind]}`, ' ', chip(d.status)),
      h('dl', { class: 'kv' }, h('dt', {}, '申請人'), h('dd', {}, `${d.empName}（${d.empId}）`), h('dt', {}, '內容'), h('dd', {}, summary(d)), h('dt', {}, '事由'), h('dd', {}, d.reason || '—'), h('dt', {}, '送出時間'), h('dd', {}, fmt(d.filedAt))),
      h('h2', {}, '簽核歷程'), h('div', { class: 'tablewrap' }, h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, '時間'), h('th', {}, '人'), h('th', {}, '關卡'), h('th', {}, '動作'), h('th', {}, '意見'))), hist)),
      (d.canAct || (isMine && (open || d.status === 'approved')) || (!isMine && d.status === 'approved')) ? h('div', {}, comment, box,
        h('div', { class: 'btnrow' },
          d.canAct ? h('button', { id: 'btnApprove', onclick: () => act('approve') }, d.status === 'pending' ? '核准（送人資複核）' : '核准') : null,
          d.canAct ? h('button', { id: 'btnReject', class: 'bad', onclick: () => act('reject', true) }, '駁回') : null,
          isMine && open ? h('button', { id: 'btnWithdraw', class: 'ghost', onclick: () => act('withdraw') }, '抽單') : null,
          d.status === 'approved' ? h('button', { id: 'btnCancel', class: 'ghost', onclick: () => act('cancel') }, '銷假／取消') : null)) : null));
  }

  async function audit() {
    const { ok, data } = await api('/api/audit'), tb = h('tbody');
    if (ok) data.forEach(x => tb.append(h('tr', {}, h('td', {}, fmt(x.at)), h('td', {}, x.actor_id || ''), h('td', {}, x.action), h('td', {}, x.target || ''), h('td', {}, x.detail ? JSON.stringify(x.detail) : ''))));
    view.append(h('section', { class: 'card' }, h('h2', {}, '稽核紀錄（最近 200 筆）'), ok ? h('div', { class: 'tablewrap' }, h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, '時間'), h('th', {}, '操作人'), h('th', {}, '動作'), h('th', {}, '對象'), h('th', {}, '內容'))), tb)) : h('div', { class: 'msg bad' }, errText(data))));
  }

  /* ---------- 路由 ---------- */
  async function route() {
    const hash = location.hash || '#/home', [, name, arg] = hash.split('/');
    view.textContent = ''; await drawNav(name === 'apply' ? '#/apply/leave' : '#/' + name);
    if (name === 'apply') await apply(arg || 'leave'); else if (name === 'mine') await mine(); else if (name === 'inbox') await inbox();
    else if (name === 'request') await detail(+arg); else if (name === 'audit') await audit(); else await home();
  }
  window.addEventListener('hashchange', route);
  route();
})();
