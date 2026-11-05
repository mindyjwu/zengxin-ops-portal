(async () => {
  const $ = id => document.getElementById(id);
  const show = (el, on) => el.classList.toggle('hidden', !on);
  const cfg = await (await fetch('/auth/config')).json();

  async function afterLogin(me) {
    show($('loginBox'), false); show($('homeBox'), true);
    $('hello').textContent = '你好，' + me.name;
    $('roleLine').textContent = '員工編號 ' + me.id + '・角色 ' + me.role;
    const nav = $('nav'); nav.textContent = ''; show(nav, true);
    const add = (text, href, fn) => { const a = document.createElement('a'); a.textContent = text; a.href = href || '#'; if (fn) a.addEventListener('click', e => { e.preventDefault(); fn(); }); nav.appendChild(a); };
    if (me.canListEmployees) add('員工管理', '/admin.html');
    add('登出', '#', async () => { await fetch('/auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); location.reload(); });
  }
  const fail = text => { const m = $('loginMsg'); m.textContent = text; show(m, true); };
  const reasons = { not_an_employee: '這個帳號不在員工名單裡，請聯絡人資。', invalid_login: '登入沒有成功，請再試一次或聯絡管理員。', too_many_attempts: '嘗試次數太多，請稍後再試。' };
  const post = async (url, body) => { const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return { r, j: await r.json().catch(() => ({})) }; };

  const me = await fetch('/api/me');
  if (me.ok) return afterLogin(await me.json());
  show($('loginBox'), true);

  if (cfg.googleClientId) {
    const init = () => {
      if (!window.google || !google.accounts) return setTimeout(init, 200);
      google.accounts.id.initialize({ client_id: cfg.googleClientId, callback: async resp => {
        const { r, j } = await post('/auth/google', { idToken: resp.credential });
        if (r.ok) afterLogin(j); else fail(reasons[j.error] || '登入失敗');
      } });
      google.accounts.id.renderButton($('gbtn'), { theme: 'outline', size: 'large', text: 'signin_with', locale: 'zh-TW' });
    };
    init();
  } else show($('noGoogle'), true);

  if (cfg.devLogin) {
    show($('devForm'), true);
    $('devForm').addEventListener('submit', async e => {
      e.preventDefault();
      const { r, j } = await post('/auth/dev-login', { email: $('devEmail').value });
      if (r.ok) afterLogin(await (await fetch('/api/me')).json()); else fail(reasons[j.error] || '登入失敗');
    });
  }
})();
