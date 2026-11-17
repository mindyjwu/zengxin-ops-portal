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
  test('仁寶: a manager imports a CSV in the browser, dashboard and pay show, an employee sees no menu', async ({ browser }) => {
    const head = '案號,服務項目代碼,服務項目類別,項目服務次數,居服員姓名,服務日期,服務時間長度(分),項目單價,加班類型,居住(區),服務單位,服務狀態';
    const csv = [head, 'T-1,BA20,陪伴服務,1,測試員甲,2031-06-03,60,175,正常班,竹北市,機構一,已簽退', 'T-2,BA20,陪伴服務,1,測試員甲,2031-06-04,60,175,正常班,竹北市,機構一,已簽退'].join('\n');
    const errs = [], hr = await login(browser, 'manager@example.test');
    hr.page.on('pageerror', e => errs.push(e.message));
    hr.page.on('console', m => { if (m.type() === 'error' && /Content Security Policy/.test(m.text())) errs.push(m.text()); });
    await hr.page.goto(BASE + '/app.html#/svc/import');
    await hr.page.setInputFiles('#svcFile', { name: 'svc.csv', mimeType: 'text/csv', buffer: Buffer.from('\ufeff' + csv, 'utf8') });
    await expect(hr.page.locator('.tiles')).toContainText('2031-06');
    await expect(hr.page.locator('body')).not.toContainText('T-1');            // 案號不會顯示、也不會送出
    await hr.page.click('#svcCommit');
    await expect(hr.page.locator('.msg.ok')).toContainText('2031-06');
    await hr.page.goto(BASE + '/app.html#/svc');
    await hr.page.selectOption('#dmonth', '2031-06');
    await expect(hr.page.locator('svg.chart rect.bar').first()).toBeVisible();
    await expect(hr.page.locator('.tiles')).toContainText('服務人數');
    await hr.page.goto(BASE + '/app.html#/svc/workers');
    await hr.page.selectOption('#wmonth', '2031-06');
    await expect(hr.page.locator('tbody')).toContainText('測試員甲');
    expect(errs).toEqual([]);
    await hr.ctx.close();
    const emp = await login(browser, 'a@example.test');
    await expect(emp.page.locator('#nav')).not.toContainText('仁寶');
    await emp.ctx.close();
  });
  test('時薪制: HR imports a template, sees results, changes the rules from a month on; the manager only views', async ({ browser }) => {
    const errs = [], hr = await login(browser, 'hr@example.test');
    hr.page.on('pageerror', e => errs.push(e.message));
    hr.page.on('console', m => { if (m.type() === 'error' && /Content Security Policy/.test(m.text())) errs.push(m.text()); });
    await hr.page.goto(BASE + '/app.html#/pay/import');
    const cols = await hr.page.evaluate(() => SvcParse.oxCols({ ot: Array.from({ length: 14 }, (_, i) => ({ day: ['平日加班', '平日加班', '國定假日加班', '國定假日加班', '國定假日加班', '國定假日加班', '休息日加班', '休息日加班', '休息日加班', '休息日加班', '例假日加班', '例假日加班', '例假日加班', '例假日加班'][i], band: ['第9-10小時', '第11-12小時', '第0-2小時', '第3-8小時', '第9-10小時', '第11-12小時', '第0-2小時', '第3-8小時', '第9-10小時', '第11-12小時', '第0-2小時', '第3-8小時', '第9-10小時', '第11-12小時'][i] })) }).map(c => c[1]));
    const val = { 工號: 'OXHR951', 姓名: '測試', '平日服務分鐘數（本薪）': '6000', 平日交通分鐘: '1200', '勞保自付額': '600', '健保自付額': '400' };
    const csv = [cols.join(','), cols.map(c => val[c] || '0').join(',')].join('\n');
    await hr.page.fill('#imonth', '2031-06');
    await hr.page.setInputFiles('#payFile', { name: 'pay.csv', mimeType: 'text/csv', buffer: Buffer.from('\ufeff' + csv, 'utf8') });
    await expect(hr.page.locator('main')).toContainText('讀到 1 人');
    await hr.page.click('#payCommit');
    await expect(hr.page.locator('.msg.ok')).toContainText('已匯入 1 人');
    await hr.page.goto(BASE + '/app.html#/pay');
    await hr.page.fill('#pmonth', '2031-06');
    const row = hr.page.locator('tbody tr', { hasText: 'OXHR951' });
    await expect(row).toContainText('23,920');                                                    // 100 小時 × 210 ＋ 轉場 20 小時 × 196 － 代扣 1,000
    await hr.page.goto(BASE + '/app.html#/pay/rules');
    await hr.page.fill('#rmonth', '2031-07');
    await hr.page.fill('#effFrom', '2031-07');
    await hr.page.locator('table').nth(0).locator('input').nth(1).fill('220');                  // 第一列「其他人員」時薪 210 → 220
    await hr.page.locator('table').nth(0).locator('input').nth(1).dispatchEvent('change');
    await hr.page.click('#saveRules');
    await expect(hr.page.locator('.msg.ok')).toContainText('2031-07 起適用');
    expect(errs).toEqual([]);
    await hr.ctx.close();
    const mgr = await login(browser, 'manager@example.test');
    await mgr.page.goto(BASE + '/app.html#/pay');
    await mgr.page.fill('#pmonth', '2031-06');
    await expect(mgr.page.locator('tbody tr', { hasText: 'OXHR951' })).toContainText('23,920');
    await expect(mgr.page.locator('.tabs')).not.toContainText('匯入');
    await mgr.page.goto(BASE + '/app.html#/pay/rules');
    await expect(mgr.page.locator('main')).toContainText('只有人資能改規則');
    await mgr.ctx.close();
    const emp = await login(browser, 'a@example.test');
    await expect(emp.page.locator('#nav')).not.toContainText('時薪制');
    await emp.ctx.close();
  });
  test('時薪制: 分鐘數由 Portal 用仁寶服務紀錄算，看不懂的加班類型要人資歸類，寫入後結果頁有數字', async ({ browser }) => {
    const head = '案號,服務項目代碼,服務項目類別,項目服務次數,居服員姓名,服務日期,服務時間長度(分),項目單價,加班類型,居住(區),服務單位,服務狀態';
    const L = (day, min, type) => `C-${day}-${type},BA20,陪伴服務,1,示範員工甲,${day},${min},175,${type},竹北市,機構一,已簽退`;
    const csv = [head, L('2031-08-04', 600, '正常班'), L('2031-08-09', 300, '休息日加班'), L('2031-08-10', 30, '怪標籤')].join('\n');
    const mgr = await login(browser, 'manager@example.test');
    await mgr.page.goto(BASE + '/app.html#/svc/import');
    await mgr.page.setInputFiles('#svcFile', { name: 'svc.csv', mimeType: 'text/csv', buffer: Buffer.from('\ufeff' + csv, 'utf8') });
    await mgr.page.click('#svcCommit');
    await expect(mgr.page.locator('.msg.ok')).toContainText('2031-08');
    await mgr.ctx.close();
    const errs = [], hr = await login(browser, 'hr@example.test');
    hr.page.on('pageerror', e => errs.push(e.message));
    hr.page.on('console', m => { if (m.type() === 'error' && /Content Security Policy/.test(m.text())) errs.push(m.text()); });
    await hr.page.goto(BASE + '/app.html#/pay/import');
    await hr.page.fill('#imonth', '2031-08');
    await hr.page.click('#svcPreview');
    await expect(hr.page.locator('main')).toContainText('怪標籤');                                  // 看不懂的標籤要列出來，不猜
    await expect(hr.page.locator('tbody tr', { hasText: '示範員工甲' })).toContainText('J020003');
    await hr.page.locator('select[aria-label="歸類 怪標籤"]').selectOption('national');
    await hr.page.locator('select[aria-label="歸類 怪標籤"]').locator('xpath=..').locator('button', { hasText: '歸類' }).click();
    await expect(hr.page.locator('main')).not.toContainText('系統看不懂');
    await hr.page.click('#svcWrite');
    await expect(hr.page.locator('.msg.ok').last()).toContainText('已寫入 1 人');
    await hr.page.goto(BASE + '/app.html#/pay');
    await hr.page.fill('#pmonth', '2031-08');
    const row = hr.page.locator('tbody tr', { hasText: 'J020003' });
    await expect(row).toContainText('15.50');                                                     // 480 ＋ 120（平日 9–10 小時）＋ 300 ＋ 30 分鐘 ＝ 930 分鐘
    await expect(row).toContainText('1,680');                                                     // 本薪 480 分鐘 ÷ 60 × 210
    await expect(hr.page.locator('main')).toContainText('國定假日加班第0-2小時 30 分');
    expect(errs).toEqual([]);
    await hr.ctx.close();
  });
  test('薪資單: HR previews a draft, publishes and locks, the employee sees only their own, reopening hides it again', async ({ browser }) => {
    const errs = [], hr = await login(browser, 'hr@example.test');
    hr.page.on('pageerror', e => errs.push(e.message));
    hr.page.on('console', m => { if (m.type() === 'error' && /Content Security Policy/.test(m.text())) errs.push(m.text()); });
    const cols = await hr.page.evaluate(() => SvcParse.oxCols({ ot: Array.from({ length: 14 }, (_, i) => ({ day: ['平日加班', '平日加班', '國定假日加班', '國定假日加班', '國定假日加班', '國定假日加班', '休息日加班', '休息日加班', '休息日加班', '休息日加班', '例假日加班', '例假日加班', '例假日加班', '例假日加班'][i], band: ['第9-10小時', '第11-12小時', '第0-2小時', '第3-8小時', '第9-10小時', '第11-12小時', '第0-2小時', '第3-8小時', '第9-10小時', '第11-12小時', '第0-2小時', '第3-8小時', '第9-10小時', '第11-12小時'][i] })) }).map(c => c[1]));
    const val = { 工號: 'J020003', 姓名: '示範員工甲', '平日服務分鐘數（本薪）': '6000', 平日交通分鐘: '1200', 勞保自付額: '600', 健保自付額: '400' };
    await hr.page.goto(BASE + '/app.html#/pay/import');
    await hr.page.fill('#imonth', '2031-09');
    await hr.page.setInputFiles('#payFile', { name: 'pay.csv', mimeType: 'text/csv', buffer: Buffer.from('\ufeff' + [cols.join(','), cols.map(c => val[c] || '0').join(',')].join('\n'), 'utf8') });
    await hr.page.click('#payCommit');
    await expect(hr.page.locator('.msg.ok')).toContainText('已匯入 1 人');
    await hr.page.goto(BASE + '/payslip.html?month=2031-09&emp=J020003');                         // 草稿預覽
    await expect(hr.page.locator('.slip')).toContainText('牛津居家長照機構');
    await expect(hr.page.locator('.slipdraft')).toContainText('草稿');
    await expect(hr.page.locator('.slip')).toContainText('實發金額');
    await expect(hr.page.locator('.slip')).toContainText('NT$23,920');
    const emp = await login(browser, 'a@example.test');
    await emp.page.goto(BASE + '/app.html#/payslips');
    await expect(emp.page.locator('main')).toContainText('目前沒有已發布的薪資單');                    // 草稿員工看不到
    await expect(emp.page.locator('#nav')).not.toContainText('我的薪資單');
    await hr.page.goto(BASE + '/app.html#/pay');
    await hr.page.fill('#pmonth', '2031-09');
    await expect(hr.page.locator('main')).toContainText('草稿：員工還看不到');
    await hr.page.click('#payPublish');
    await expect(hr.page.locator('.msg.ok').last()).toContainText('已發布並鎖定');
    await expect(hr.page.locator('main')).toContainText('已發布並鎖定（版本 1）');
    await hr.page.goto(BASE + '/app.html#/pay/import');                                          // 鎖定後不能再匯入
    await hr.page.fill('#imonth', '2031-09');
    await hr.page.setInputFiles('#payFile', { name: 'pay.csv', mimeType: 'text/csv', buffer: Buffer.from('\ufeff' + [cols.join(','), cols.map(c => val[c] || '0').join(',')].join('\n'), 'utf8') });
    await hr.page.click('#payCommit');
    await expect(hr.page.locator('.msg.bad')).toContainText('已發布並鎖定');
    await emp.page.goto(BASE + '/app.html#/payslips'); await emp.page.reload();
    await expect(emp.page.locator('#nav')).toContainText('我的薪資單');
    await expect(emp.page.locator('main')).toContainText('2031-09');
    await emp.page.goto(BASE + '/payslip.html?month=2031-09&mine=1');
    await expect(emp.page.locator('.slip')).toContainText('示範員工甲');
    await expect(emp.page.locator('.slipdraft')).toHaveCount(0);
    await emp.page.emulateMedia({ media: 'print' });
    await expect(emp.page.locator('.slipbar')).toBeHidden();                                      // 列印時不顯示按鈕列
    await emp.page.goto(BASE + '/payslip.html?month=2031-09&emp=J020003');                        // 看別人的／HR 的端點：沒有權限
    await expect(emp.page.locator('main')).toContainText('沒有權限');
    await hr.page.goto(BASE + '/app.html#/pay'); await hr.page.fill('#pmonth', '2031-09');
    await hr.page.fill('#reopenReason', '更正轉場分鐘');
    await hr.page.click('#payReopen');
    await expect(hr.page.locator('.msg.ok').last()).toContainText('已退回');
    await emp.page.goto(BASE + '/payslip.html?month=2031-09&mine=1');
    await expect(emp.page.locator('main')).toContainText('找不到這張薪資單');                          // 退回後員工立刻看不到
    expect(errs).toEqual([]);
    await hr.ctx.close(); await emp.ctx.close();
  });
  test('拆帳制: 仁寶資料算出拆帳薪資，指定員編、匯入加扣項、發布後員工看到服務項目明細', async ({ browser }) => {
    const head = '案號,服務項目代碼,服務項目類別,項目服務次數,居服員姓名,服務日期,服務時間長度(分),項目單價,加班類型,居住(區),服務單位,服務狀態';
    const L = (who, day, min, type, code, name, n) => `C-${who}-${day},${code},${name},${n},${who},${day},${min},325,${type},竹北市,機構一,已簽退`;
    const csv = [head, L('示範員工甲', '2031-10-06', 60, '正常班', 'BA07', '協助沐浴及洗頭', 1), L('示範員工甲', '2031-10-11', 60, '國定假日', 'BA07', '協助沐浴及洗頭', 1), L('外部居服員', '2031-10-07', 30, '正常班', 'BA20', '陪伴服務', 2)].join('\n');
    const mgr = await login(browser, 'manager@example.test');
    await mgr.page.goto(BASE + '/app.html#/svc/import');
    await mgr.page.setInputFiles('#svcFile', { name: 'svc.csv', mimeType: 'text/csv', buffer: Buffer.from('\ufeff' + csv, 'utf8') });
    await mgr.page.click('#svcCommit');
    await expect(mgr.page.locator('.msg.ok')).toContainText('2031-10');
    await mgr.ctx.close();
    const errs = [], hr = await login(browser, 'hr@example.test');
    hr.page.on('pageerror', e => errs.push(e.message));
    hr.page.on('console', m => { if (m.type() === 'error' && /Content Security Policy/.test(m.text())) errs.push(m.text()); });
    await hr.page.goto(BASE + '/app.html#/split');
    await hr.page.fill('#smonth', '2031-10');
    const row = hr.page.locator('tbody tr', { hasText: 'J020003' });
    await expect(row).toBeVisible();
    await expect(hr.page.locator('main')).toContainText('外部居服員');                                  // 對不到員編的要列出來
    await hr.page.locator('input[aria-label="指定員編 外部居服員"]').fill('OX0400');
    await hr.page.locator('input[aria-label="指定員編 外部居服員"]').locator('xpath=..').locator('button', { hasText: '指定' }).click();
    await expect(hr.page.locator('tbody tr', { hasText: 'OX0400' })).toBeVisible();
    await hr.page.goto(BASE + '/app.html#/split/import');
    await hr.page.fill('#imonth', '2031-10');
    const cols = ['工號', '姓名', '方案（A／B，空白＝依身分）', '交通津貼（10 公里）（金額）', '勞保自付額（金額）'];
    await hr.page.evaluate(() => 0);
    const extrasCols = await hr.page.evaluate(() => SvcParse.splitCols([{ k: 'transport10', label: '交通津貼（10 公里）' }, { k: 'labor', label: '勞保自付額' }]).map(c => c[1]));
    expect(extrasCols).toEqual(['工號', '姓名', '方案（A／B，空白＝依身分）', '交通津貼（10 公里）（金額）', '勞保自付額（金額）']);
    await hr.page.setInputFiles('#splitFile', { name: 'split.csv', mimeType: 'text/csv', buffer: Buffer.from('\ufeff' + cols.join(',') + '\nJ020003,示範員工甲,,300,600\n', 'utf8') });
    await expect(hr.page.locator('main')).toContainText('讀到 1 人');
    await hr.page.click('#splitCommit');
    await expect(hr.page.locator('.msg.ok')).toContainText('已匯入 1 人');
    await hr.page.goto(BASE + '/app.html#/split');
    await hr.page.fill('#smonth', '2031-10');
    await hr.page.click('#payPublish');
    await expect(hr.page.locator('.msg.ok').last()).toContainText('已發布並鎖定');
    const emp = await login(browser, 'a@example.test');
    await emp.page.goto(BASE + '/app.html#/payslips');
    await expect(emp.page.locator('main')).toContainText('2031-10（拆帳制）');
    await emp.page.goto(BASE + '/payslip.html?kind=split&month=2031-10&mine=1');
    await expect(emp.page.locator('.slip')).toContainText('服務項目明細');
    await expect(emp.page.locator('.slip')).toContainText('協助沐浴及洗頭');
    await expect(emp.page.locator('.slip')).toContainText('交通津貼（10 公里）');
    await expect(emp.page.locator('.slip')).toContainText('實發金額');
    await expect(emp.page.locator('.slipdraft')).toHaveCount(0);
    await hr.page.goto(BASE + '/payslip.html?kind=split&month=2031-10&all=1');
    await expect(hr.page.locator('.slip')).toHaveCount(2);                                            // 兩位都有薪資單
    expect(errs).toEqual([]);
    await hr.ctx.close(); await emp.ctx.close();
  });
});
