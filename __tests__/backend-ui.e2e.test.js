/** 連後端版網站的端到端測試：真的啟動伺服器，用瀏覽器走一遍登入、申請、簽核、打卡。 */
const { test, expect } = require('@playwright/test');
const { spawn } = require('child_process');
const path = require('path');

const PORT = 8123, BASE = `http://localhost:${PORT}`;
let server;

test.beforeAll(async () => {
  server = spawn('node', ['server/index.js'], { cwd: path.resolve(__dirname, '..'), env: { ...process.env, PORT: String(PORT), SEED: '1', DEV_LOGIN: '1', NODE_ENV: 'development' }, stdio: 'ignore' });
  for (let i = 0; i < 60; i++) { try { const r = await fetch(BASE + '/healthz'); if (r.ok) return; } catch (_) { /* 還沒好 */ } await new Promise(r => setTimeout(r, 500)); }
  throw new Error('server did not start');
});
test.afterAll(() => { if (server) server.kill(); });

async function login(browser, email) {
  const ctx = await browser.newContext(), page = await ctx.newPage();
  await page.goto(BASE + '/');
  await page.fill('#devEmail', email);
  await page.click('#devForm button');
  await expect(page.locator('#who')).toBeVisible();
  return { ctx, page };
}

test.describe('connected web app', () => {
  test('a person who is not an employee is refused with a clear message', async ({ browser }) => {
    const ctx = await browser.newContext(), page = await ctx.newPage();
    await page.goto(BASE + '/');
    await page.fill('#devEmail', 'stranger@example.test');
    await page.click('#devForm button');
    await expect(page.locator('#loginMsg')).toContainText('不在員工名單');
    await ctx.close();
  });

  test('punching in shows the time but never the location', async ({ browser }) => {
    const { ctx, page } = await login(browser, 'a@example.test');
    await page.click('#btnIn');
    await expect(page.locator('.msg.ok')).toContainText('上班打卡成功');
    await expect(page.locator('tbody tr').first()).toContainText('上班');
    await expect(page.locator('body')).not.toContainText('IP');
    await ctx.close();
  });

  test('leave: employee files, manager approves, HR countersigns, employee sees it approved', async ({ browser }) => {
    const emp = await login(browser, 'a@example.test');
    await emp.page.goto(BASE + '/app.html#/apply/leave');
    await emp.page.selectOption('#lType', 'personal');
    await emp.page.fill('#lFrom', '2031-05-05'); await emp.page.fill('#lTo', '2031-05-05');
    await emp.page.fill('#lReason', 'e2e');
    await emp.page.click('#applyForm button[type=submit]');
    await expect(emp.page.locator('.msg.ok')).toContainText('已送出：L');
    const no = (await emp.page.locator('.msg.ok').innerText()).match(/L\d+/)[0];

    const mgr = await login(browser, 'manager@example.test');
    await mgr.page.goto(BASE + '/app.html#/inbox');
    await expect(mgr.page.locator('.badge')).toBeVisible();
    await mgr.page.locator('tr.click', { hasText: no }).click();
    await expect(mgr.page.locator('dl.kv')).toContainText('事假');                      // 假別顯示中文名稱，不是代碼
    await mgr.page.fill('#comment', '同意');
    await mgr.page.click('#btnApprove');
    await expect(mgr.page.locator('h2', { hasText: no })).toContainText('待人資複核');

    const hr = await login(browser, 'hr@example.test');
    await hr.page.goto(BASE + '/app.html#/inbox');
    await hr.page.locator('tr.click', { hasText: no }).click();
    await hr.page.click('#btnApprove');
    await expect(hr.page.locator('h2', { hasText: no })).toContainText('已核准');

    await emp.page.goto(BASE + '/app.html#/mine');
    await expect(emp.page.locator('tr', { hasText: no })).toContainText('已核准');
    await emp.page.locator('tr.click', { hasText: no }).click();
    await expect(emp.page.locator('tbody').last()).toContainText('直屬主管');
    for (const c of [emp, mgr, hr]) await c.ctx.close();
  });

  test('errors are explained in Chinese: overlap, quota, reject needs a reason', async ({ browser }) => {
    const emp = await login(browser, 'a@example.test');
    const file = async (from, hours) => { await emp.page.goto(BASE + '/app.html#/apply/leave'); await emp.page.selectOption('#lType', 'family'); await emp.page.fill('#lFrom', from); await emp.page.fill('#lTo', from); await emp.page.fill('#lHours', String(hours)); await emp.page.click('#applyForm button[type=submit]'); };
    await file('2031-06-02', 4); await expect(emp.page.locator('.msg.ok')).toBeVisible();
    await file('2031-06-02', 4); await expect(emp.page.locator('.msg.bad')).toContainText('已經有請假申請');
    const mgr = await login(browser, 'manager@example.test');
    await mgr.page.goto(BASE + '/app.html#/inbox');
    await mgr.page.locator('tr.click').first().click();
    await mgr.page.click('#btnReject');
    await expect(mgr.page.locator('.msg.bad')).toContainText('駁回要寫理由');
    for (const c of [emp, mgr]) await c.ctx.close();
  });

  test('overtime and punch correction forms submit; the applicant can withdraw', async ({ browser }) => {
    const emp = await login(browser, 'a@example.test');
    await emp.page.goto(BASE + '/app.html#/apply/overtime');
    await emp.page.fill('#oDate', '2031-07-01');
    await emp.page.click('#applyForm button[type=submit]');
    await expect(emp.page.locator('.msg.ok')).toContainText('已送出：OT');
    await emp.page.goto(BASE + '/app.html#/apply/punchfix');
    await emp.page.fill('#fDate', '2020-01-02');
    await emp.page.click('#applyForm button[type=submit]');
    await expect(emp.page.locator('.msg.ok')).toContainText('已送出：F');
    await emp.page.goto(BASE + '/app.html#/mine');
    await emp.page.locator('tr.click', { hasText: '補打卡' }).first().click();
    await emp.page.click('#btnWithdraw');
    await expect(emp.page.locator('h2').first()).toContainText('已抽單');
    await emp.ctx.close();
  });

  test('menus follow the role: employee sees no admin links; administrator sees the audit log', async ({ browser }) => {
    const emp = await login(browser, 'a@example.test');
    await expect(emp.page.locator('nav')).not.toContainText('員工管理');
    await expect(emp.page.locator('nav')).not.toContainText('稽核紀錄');
    const admin = await login(browser, 'admin@example.test');
    await expect(admin.page.locator('nav')).toContainText('稽核紀錄');
    await admin.page.goto(BASE + '/app.html#/audit');
    await expect(admin.page.locator('table tbody tr').first()).toBeVisible();
    for (const c of [emp, admin]) await c.ctx.close();
  });

  test('the pages load with no script errors and no CSP violations', async ({ browser }) => {
    const ctx = await browser.newContext(), page = await ctx.newPage(), errs = [];
    page.on('pageerror', e => errs.push(e.message));
    page.on('console', m => { if (m.type() === 'error' && /Content Security Policy/.test(m.text())) errs.push(m.text()); });
    await page.goto(BASE + '/'); await page.fill('#devEmail', 'hr@example.test'); await page.click('#devForm button');
    await expect(page.locator('#who')).toBeVisible();                    // 等登入後的跳轉完成，再開始逐頁檢查
    for (const h of ['#/home', '#/apply/leave', '#/apply/overtime', '#/apply/punchfix', '#/mine', '#/inbox']) { await page.goto(BASE + '/app.html' + h); await expect(page.locator('main')).not.toBeEmpty(); }
    await page.goto(BASE + '/admin.html'); await expect(page.locator('#rows tr').first()).toBeVisible();
    expect(errs).toEqual([]);
    await ctx.close();
  });
});
