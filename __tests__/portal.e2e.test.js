/**
 * End-to-end UI tests for the 誠馨日照 operations portal (ltc-portal.html).
 *
 * The page is a single-file prototype with in-memory data and a fixed demo
 * date of 2026-09-08. Built roles: admin (E1005, HQ), hr (E1003, HQ),
 * manager (E2101, director of O1 竹北日照中心) and employee (E2104, care
 * attendant at O1, self-service 私人秘書 only).
 */

const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');

const PORTAL = 'file://' + path.resolve(__dirname, '../ltc-portal.html');

/* ---------- helpers ---------- */
async function openPortal(page) {
  await page.goto(PORTAL);
  await expect(page.locator('#roleSel')).toBeVisible();
}
async function setRole(page, role) {
  await page.selectOption('#roleSel', role);
  await expect(page.locator('#roleSel')).toHaveValue(role);
}
async function go(page, mod, tab) {
  await page.click(`[data-mod="${mod}"]`);
  if (tab) await page.click(`[data-tab="${tab}"]`);
}
const empRows = page => page.locator('#view tbody tr[data-emp]');
const requestRow = (page, id) =>
  page.locator('#view tbody tr').filter({ has: page.locator('td.mono', { hasText: new RegExp(`^${id}$`) }) });
const drawer = page => page.locator('aside.drawer');

/* ================================================================ */
test.describe('Shell & role switching', () => {
  test.beforeEach(async ({ page }) => { await openPortal(page); });

  test('loads with brand and admin as default role', async ({ page }) => {
    await expect(page.locator('.brand')).toContainText('誠馨日照');
    await expect(page.locator('#roleSel')).toHaveValue('admin');
  });

  test('role selector offers only the built roles', async ({ page }) => {
    const values = await page.locator('#roleSel option').evaluateAll(os => os.map(o => o.value));
    expect(values).toEqual(['admin', 'hr', 'manager', 'employee']);
  });

  test('switching role updates the persona chip', async ({ page }) => {
    const chip = page.locator('.pagehead .chip.acc');
    await setRole(page, 'hr');
    await expect(chip).toContainText('人資部經理');
    await setRole(page, 'manager');
    await expect(chip).toContainText('中心主任');
  });

  test('HR module exposes its four tabs', async ({ page }) => {
    await go(page, 'hr');
    for (const t of ['emp', 'mylog', 'att', 'leave']) {
      await expect(page.locator(`[data-tab="${t}"]`)).toBeVisible();
    }
    await expect(page.locator('[data-tab="emp"]')).toHaveAttribute('aria-selected', 'true');
  });
});

/* ================================================================ */
test.describe('Data scope', () => {
  test.beforeEach(async ({ page }) => { await openPortal(page); });

  test('admin and hr see all 23 employees', async ({ page }) => {
    await go(page, 'hr', 'emp');
    await expect(empRows(page)).toHaveCount(23);
    await setRole(page, 'hr');
    await expect(empRows(page)).toHaveCount(23);
  });

  test('manager sees only O1 staff and the office filter is locked', async ({ page }) => {
    await setRole(page, 'manager');
    await go(page, 'hr', 'emp');
    await expect(empRows(page)).toHaveCount(8);
    const ids = await empRows(page).evaluateAll(rs => rs.map(r => r.dataset.emp));
    expect(ids.every(id => id.startsWith('E21'))).toBe(true);
    await expect(page.locator('#view tbody')).not.toContainText('竹東日照中心');
    await expect(page.locator('#offSel')).toBeDisabled();
    await expect(page.locator('#view .note.q')).toContainText('隱藏了 15 位');
  });

  test('assumption toggle opens the manager to every facility', async ({ page }) => {
    await setRole(page, 'manager');
    await go(page, 'hr', 'emp');
    await page.click('#assumeBtn');
    await expect(page.locator('#assumeBtn')).toHaveAttribute('aria-pressed', 'true');
    await expect(empRows(page)).toHaveCount(23);
    await expect(page.locator('#offSel')).toBeEnabled();
  });

  test('office filter narrows admin to one facility', async ({ page }) => {
    await go(page, 'hr', 'emp');
    await page.selectOption('#offSel', 'O2');
    await expect(empRows(page)).toHaveCount(9);
  });

  test('manager attendance and leave views are limited to O1', async ({ page }) => {
    await setRole(page, 'manager');
    await go(page, 'hr', 'att');
    await expect(page.locator('#view')).toContainText('竹北日照中心');
    await expect(page.locator('#view')).not.toContainText('竹東日照中心');

    await page.click('[data-tab="leave"]');
    await expect(requestRow(page, 'L241')).toHaveCount(1);   // E2103, O1
    await expect(requestRow(page, 'L245')).toHaveCount(0);   // E2203, O2
    await expect(requestRow(page, 'L234')).toHaveCount(0);   // E1005, HQ
  });
});

/* ================================================================ */
test.describe('Settings & permission matrix', () => {
  test.beforeEach(async ({ page }) => { await openPortal(page); });

  test('settings is in the nav for admin only', async ({ page }) => {
    await expect(page.locator('[data-mod="set"]')).toBeVisible();
    for (const r of ['hr', 'manager', 'employee']) {
      await setRole(page, r);
      await expect(page.locator('[data-mod="set"]')).toHaveCount(0);
    }
  });

  test('switching away from admin while on settings returns to 原型說明', async ({ page }) => {
    await go(page, 'set');
    await setRole(page, 'hr');
    await expect(page.locator('[data-mod="arch"]')).toHaveAttribute('aria-current', 'true');
  });

  test('admin sees the full matrix with editable permission cells', async ({ page }) => {
    await go(page, 'perm', 'matrix');
    await expect(page.locator('.permtable thead th')).toHaveCount(5);
    await expect(page.locator('[data-perm]')).toHaveCount(36);
    await expect(page.locator('[data-perm="admin|perms"]')).toBeDisabled();
    await expect(page.locator('[data-perm="admin|mgmt"]')).toBeDisabled();
    await expect(page.locator('[data-perm="employee|mgmt"]')).not.toBeChecked();
  });

  for (const r of ['hr', 'manager']) {
    test(`${r} sees only their own column, read-only, and still gets open questions`, async ({ page }) => {
      await setRole(page, r);
      await go(page, 'perm', 'matrix');
      await expect(page.locator('.permtable thead th')).toHaveCount(2);
      await expect(page.locator('[data-perm]')).toHaveCount(0);
      await expect(page.locator('#view')).toContainText('完整權限對照表僅系統管理員可檢視與調整');
      await expect(page.locator('[data-tab="open"]')).toBeVisible();
    });
  }

  test('a change made by admin takes effect for that role and can be restored', async ({ page }) => {
    await go(page, 'perm', 'matrix');
    await page.check('[data-perm="manager|salary"]');
    await expect(page.locator('#view')).toContainText('權限異動紀錄');

    await setRole(page, 'manager');
    await expect(page.locator('[data-mod="pay"]')).toBeVisible();
    await go(page, 'hr', 'emp');
    await expect(empRows(page).first()).toContainText('NT$');

    await setRole(page, 'admin');
    await go(page, 'perm', 'matrix');
    await page.click('[data-permreset]');
    await expect(page.locator('[data-perm="manager|salary"]')).not.toBeChecked();
    await setRole(page, 'manager');
    await expect(page.locator('[data-mod="pay"]')).toHaveCount(0);
  });
});

/* ================================================================ */
test.describe('Employee role & 私人秘書 (My Desk)', () => {
  test.beforeEach(async ({ page }) => { await openPortal(page); });
  const openForm = async (page, id) => { await page.click('[data-tab="forms"]'); await page.click(`[data-dform="${id}"]`); };
  const rowOf = (page, id) => page.locator('#view tr', { hasText: id });

  test('employee lands on 私人秘書 and sees only self-service modules', async ({ page }) => {
    await setRole(page, 'employee');
    await expect(page.locator('[data-mod="desk"]')).toHaveAttribute('aria-current', 'true');
    await expect(page.locator('[data-tab="home"]')).toHaveAttribute('aria-selected', 'true');
    const mods = await page.locator('[data-mod]').evaluateAll(n => n.map(x => x.dataset.mod));
    expect(mods).toEqual(['arch', 'desk', 'ann']);
    await expect(page.locator('#assumeBtn')).toHaveCount(0);
    await expect(page.locator('.pagehead .chip.acc')).toContainText('照服員');
  });

  test('home calendar shows each day’s status and punch times', async ({ page }) => {
    await setRole(page, 'employee');
    const day = d => page.locator(`[data-dday="2026-09-${d}"]`);
    await expect(day('07')).toContainText('正常');
    await expect(day('07')).toContainText(/\d\d:\d\d/);
    await expect(day('06')).toContainText('例假日');
    await expect(day('08')).toContainText('尚未打卡');
    await expect(day('25')).toContainText('中秋節');
    await expect(day('09')).toContainText('審核中');          // L242 sick leave is pending
  });

  test('an employee has nothing to sign and tracks their own open forms', async ({ page }) => {
    await setRole(page, 'employee');
    await expect(page.locator('section.card', { hasText: '未簽核表單' })).toContainText('太好了！您目前沒有待處理事項');
    const track = page.locator('section.card', { hasText: '追蹤表單' });
    await expect(track.locator('tr', { hasText: 'L242' })).toBeVisible();
    await expect(track.locator('tr', { hasText: 'OT31' })).toBeVisible();
  });

  test('withdrawing a pending leave closes it', async ({ page }) => {
    await setRole(page, 'employee');
    await page.click('[data-withdraw="L242"]');
    await openForm(page, 'track');
    await expect(rowOf(page, 'L242')).toContainText('已抽單');
    await expect(page.locator('[data-withdraw="L242"]')).toHaveCount(0);
  });

  test('clicking a calendar day prefills the leave form for that day', async ({ page }) => {
    await setRole(page, 'employee');
    await page.click('[data-dday="2026-09-04"]');
    await page.click('[data-dleave="2026-09-04"]');
    await expect(page.locator('[data-dform="leave"]')).toHaveAttribute('aria-current', 'true');
    await expect(page.locator('#leaveForm input[name="from"]')).toHaveValue('2026-09-04');
    await expect(page.locator('#leaveForm input[name="to"]')).toHaveValue('2026-09-04');
  });

  test('an off-site form goes through director approval and HR countersign', async ({ page }) => {
    await setRole(page, 'employee');
    await page.locator('.qforms [data-goform="trip"]').click();
    await page.fill('#tripForm input[name="place"]', '竹北市 個案住家');
    await page.fill('#tripForm textarea[name="reason"]', '新個案評估');
    await page.click('#tripForm button[type="submit"]');
    await expect(rowOf(page, 'F14')).toContainText('待主管簽核');

    await setRole(page, 'manager');
    await openForm(page, 'sign');
    await rowOf(page, 'F14').locator('[data-act="approve"]').click();
    await expect(rowOf(page, 'F14')).toHaveCount(0);          // now with HR, not this director

    await setRole(page, 'hr');
    await go(page, 'hr', 'leave');
    await requestRow(page, 'F14').locator('[data-act="final"]').click();
    await expect(requestRow(page, 'F14')).toContainText('已核准');
  });

  test('cancelling approved leave marks it cancelled once HR countersigns', async ({ page }) => {
    await setRole(page, 'employee');
    await openForm(page, 'cancel');
    await page.selectOption('#cancelForm select[name="ref"]', 'L236');
    await page.fill('#cancelForm textarea[name="reason"]', '當天改為正常上班');
    await page.click('#cancelForm button[type="submit"]');
    await expect(rowOf(page, 'F14')).toContainText('銷假單');

    await setRole(page, 'manager');
    await go(page, 'hr', 'leave');
    await requestRow(page, 'F14').locator('[data-act="approve"]').click();
    await setRole(page, 'hr');
    await go(page, 'hr', 'leave');
    await requestRow(page, 'F14').locator('[data-act="final"]').click();
    await expect(requestRow(page, 'L236')).toContainText('已銷假');
  });

  test('certificate requests skip the director and go straight to HR', async ({ page }) => {
    await setRole(page, 'employee');
    await openForm(page, 'cert');
    await page.fill('#docForm input[name="purpose"]', '申辦房屋貸款');
    await page.click('#docForm button[type="submit"]');
    await expect(rowOf(page, 'F14')).toContainText('待人資複核');

    await setRole(page, 'manager');
    await openForm(page, 'sign');
    await expect(rowOf(page, 'F14')).toHaveCount(0);
    await setRole(page, 'hr');
    await openForm(page, 'sign');
    await expect(rowOf(page, 'F14').locator('[data-act="final"]')).toBeVisible();
  });

  test('payslip shows the employee’s own paid months without employer cost', async ({ page }) => {
    await setRole(page, 'employee');
    await page.click('[data-tab="query"]');
    await page.click('[data-dq="slip"]');
    const months = await page.locator('#slipMonth option').evaluateAll(o => o.map(x => x.value));
    expect(months).toEqual(['2026-06', '2026-07', '2026-08']);
    const net = await page.evaluate(() => calcPay('E2104', '2026-08').net);
    await expect(page.locator('#view')).toContainText('NT$' + net.toLocaleString('en-US'));
    await expect(page.locator('#view')).not.toContainText('雇主');
  });

  test('only approvers get the 部屬資料 look-ups', async ({ page }) => {
    await setRole(page, 'employee');
    await page.click('[data-tab="query"]');
    await expect(page.locator('[data-dq="subatt"]')).toHaveCount(0);
    await setRole(page, 'manager');
    await page.click('[data-tab="query"]');
    await page.click('[data-dq="subatt"]');
    await expect(page.locator('#view tbody tr')).toHaveCount(7);   // direct and indirect reports at O1
  });

  test('who-is-out names colleagues but never their leave type', async ({ page }) => {
    await setRole(page, 'employee');
    await page.click('[data-pday="2026-09-18"]');                  // E2107 family-care leave (L243)
    const name = await page.evaluate(() => empName('E2107'));
    const box = page.locator('.peerbox', { hasText: '部門同事' });
    await expect(box).toContainText(name);
    await expect(box).not.toContainText('家庭照顧假');
  });

  test('batch missed punches files one correction per ticked day', async ({ page }) => {
    await setRole(page, 'manager');
    await page.click('[data-mod="desk"]');
    await openForm(page, 'fix');
    const n = await page.locator('#batchFix input[name="pick"]').count();
    expect(n).toBeGreaterThan(0);
    const before = await page.evaluate(() => PUNCH_FIX.length);
    await page.click('#batchFix button[type="submit"]');
    expect(await page.evaluate(() => PUNCH_FIX.length)).toBe(before + n);
    await expect(page.locator('[data-dform="track"]')).toHaveAttribute('aria-current', 'true');
  });
});

/* ================================================================ */
test.describe('Salary visibility', () => {
  test.beforeEach(async ({ page }) => {
    await openPortal(page);
    await go(page, 'hr', 'emp');
  });

  test('hr sees monthly pay', async ({ page }) => {
    await setRole(page, 'hr');
    const pay = page.locator('tr[data-emp="E2103"] td').last();
    await expect(pay).toHaveText('NT$58,000');
    await expect(page.locator('#view tbody .lock')).toHaveCount(0);
  });

  for (const role of ['admin', 'manager']) {
    test(`${role} sees the lock instead of pay`, async ({ page }) => {
      await setRole(page, role);
      const pay = page.locator('tr[data-emp="E2103"] td').last();
      await expect(pay.locator('.lock')).toContainText('僅人資可見');
      await expect(page.locator('#view tbody')).not.toContainText('NT$');
    });
  }
});

/* ================================================================ */
test.describe('Leave approval flow', () => {
  test.beforeEach(async ({ page }) => { await openPortal(page); });

  test('pending → countersign → approved', async ({ page }) => {
    await setRole(page, 'manager');
    await go(page, 'hr', 'leave');
    let row = requestRow(page, 'L241');
    await expect(row).toContainText('待主管簽核');

    await row.locator('[data-act="approve"]').click();
    row = requestRow(page, 'L241');
    await expect(row).toContainText('待人資複核');
    await expect(row.locator('.lock')).toContainText('待人資處理');
    await expect(row.locator('[data-act]')).toHaveCount(0);

    await setRole(page, 'hr');
    row = requestRow(page, 'L241');
    await expect(row).toContainText('待人資複核');
    await row.locator('[data-act="final"]').click();
    row = requestRow(page, 'L241');
    await expect(row).toContainText('已核准');
    await expect(row.locator('[data-act]')).toHaveCount(0);
  });

  test('reject ends the request', async ({ page }) => {
    await setRole(page, 'manager');
    await go(page, 'hr', 'leave');
    await requestRow(page, 'L242').locator('[data-act="reject"]').click();
    await expect(requestRow(page, 'L242')).toContainText('已駁回');
  });

  test('admin has no approval rights', async ({ page }) => {
    await go(page, 'hr', 'leave');
    const row = requestRow(page, 'L241');
    await expect(row.locator('.lock')).toContainText('無簽核權限');
    await expect(row.locator('[data-act]')).toHaveCount(0);
  });

  test('an approver cannot sign their own request', async ({ page }) => {
    await setRole(page, 'hr');
    await go(page, 'hr', 'mylog');
    await page.click('[data-mytab="leave"]');
    await page.click('[data-quick="am"]');
    await page.fill('#leaveForm textarea[name="reason"]', 'e2e');
    await page.click('#leaveForm button[type="submit"]');
    await page.click('[data-tab="leave"]');
    const row = requestRow(page, 'L249');
    await expect(row.locator('.lock')).toContainText('本人申請');
    await expect(row.locator('[data-act]')).toHaveCount(0);
  });
});

/* ================================================================ */
test.describe('My Hours', () => {
  test('clock in and out records the day and worked hours', async ({ page }) => {
    await page.clock.setFixedTime(new Date(2026, 8, 8, 8, 0));
    await openPortal(page);
    await go(page, 'hr', 'mylog');

    const inBtn = page.locator('[data-punch="in"]'), outBtn = page.locator('[data-punch="out"]');
    await expect(inBtn).toBeEnabled();
    await expect(outBtn).toBeDisabled();

    await inBtn.click();
    await expect(inBtn).toBeDisabled();
    await expect(outBtn).toBeEnabled();
    const today = page.locator('#view tbody tr').filter({ hasText: '2026-09-08' });
    // columns: date, shift, in, out, hours
    await expect(today.locator('td').nth(1)).toContainText('白班');
    await expect(today.locator('td').nth(2)).toHaveText('08:00');

    await page.clock.setFixedTime(new Date(2026, 8, 8, 17, 30));
    await outBtn.click();
    await expect(today.locator('td').nth(3)).toHaveText('17:30');
    // 08:00–17:30 minus the 1 h lunch break
    await expect(today.locator('td').nth(4)).toHaveText('8.5');
    await expect(page.locator('.clockface')).toContainText('8.5');
  });

  test('clocking in and out in the same minute counts 0 h, not 24', async ({ page }) => {
    await page.clock.setFixedTime(new Date(2026, 8, 8, 9, 15));
    await openPortal(page);
    await go(page, 'hr', 'mylog');
    await page.click('[data-punch="in"]');
    await page.click('[data-punch="out"]');
    const today = page.locator('#view tbody tr').filter({ hasText: '2026-09-08' });
    await expect(today.locator('td').nth(3)).toHaveText('09:15');
    await expect(today.locator('td').nth(4)).toHaveText('—');
  });

  test('half-day leave computes 4 h and is filed as pending', async ({ page }) => {
    await openPortal(page);
    await go(page, 'hr', 'mylog');
    await page.click('[data-mytab="leave"]');
    const calc = page.locator('#leaveCalc');
    await expect(calc).toContainText('8 小時');           // default: full day

    await page.click('[data-quick="am"]');
    await expect(page.locator('#leaveForm select[name="fromT"]')).toHaveValue('08:00');
    await expect(page.locator('#leaveForm select[name="toT"]')).toHaveValue('12:00');
    await expect(calc).toContainText('4 小時（折合 0.5 天）');

    await page.click('[data-quick="pm"]');
    await expect(page.locator('#leaveForm select[name="fromT"]')).toHaveValue('13:00');
    await expect(calc).toContainText('4 小時');

    await page.fill('#leaveForm textarea[name="reason"]', '下午看診');
    await page.click('#leaveForm button[type="submit"]');
    const row = requestRow(page, 'L249');
    await expect(row.locator('td.num')).toHaveText('4');
    await expect(row).toContainText('待主管簽核');
  });

  test('rotating staff can request leave for evening and overnight shifts', async ({ page }) => {
    await openPortal(page);
    // No built role works rotating shifts, so point admin's persona at nurse E2203 (O2).
    await page.evaluate(() => { ROLES.admin.persona = 'E2203'; render(); });
    await go(page, 'hr', 'mylog');
    await page.click('[data-mytab="leave"]');
    const f = page.locator('#leaveForm'), calc = page.locator('#leaveCalc');
    const slots = await f.locator('select[name="fromT"] option').evaluateAll(os => os.map(o => o.value));
    expect(slots[0]).toBe('00:00');
    expect(slots[slots.length - 1]).toBe('24:00');

    // 2026-08-27 is an overnight shift (00:00–08:00)
    await f.locator('[name=from]').fill('2026-08-27');
    await expect(page.locator('#leaveShift')).toContainText('大夜');
    await page.click('[data-quick="full"]');
    await expect(f.locator('[name=fromT]')).toHaveValue('00:00');
    await expect(f.locator('[name=toT]')).toHaveValue('08:00');
    await expect(calc).toContainText('8 小時');
    await page.click('[data-quick="am"]');
    await expect(f.locator('[name=toT]')).toHaveValue('04:00');
    await expect(calc).toContainText('4 小時');

    // 2026-08-21 is an evening shift (16:00–24:00)
    await f.locator('[name=from]').fill('2026-08-21');
    await expect(page.locator('#leaveShift')).toContainText('小夜');
    await page.click('[data-quick="pm"]');
    await expect(f.locator('[name=fromT]')).toHaveValue('20:00');
    await expect(f.locator('[name=toT]')).toHaveValue('24:00');
    await expect(calc).toContainText('4 小時');

    await f.locator('textarea[name="reason"]').fill('夜班後半請假');
    await page.click('#leaveForm button[type="submit"]');
    const row = requestRow(page, 'L249');
    await expect(row).toContainText('2026-08-21 20:00 → 24:00');
    await expect(row.locator('td.num')).toHaveText('4');
  });

  test('overtime hours compute, including across midnight', async ({ page }) => {
    await openPortal(page);
    await go(page, 'hr', 'mylog');
    await page.click('[data-mytab="ot"]');
    const calc = page.locator('#otCalc');
    await expect(calc).toContainText('2 小時 / 2 h');             // default 17:00–19:00

    await page.fill('#otForm input[name="end"]', '20:30');
    await expect(calc).toContainText('3.5 小時');

    await page.fill('#otForm input[name="start"]', '22:00');
    await page.fill('#otForm input[name="end"]', '02:00');
    await expect(calc).toContainText('4 小時');

    await page.fill('#otForm textarea[name="reason"]', '夜間支援');
    await page.click('#otForm button[type="submit"]');
    const row = requestRow(page, 'OT33');
    await expect(row.locator('td.num')).toHaveText('4');
    await expect(page.locator('.tile').filter({ hasText: '本月加班' }).locator('.v')).toHaveText('4');
  });

  test('balance tab reflects entitlement, used and pending hours', async ({ page }) => {
    await openPortal(page);                              // admin = E1005, hired 2021-08-01
    await go(page, 'hr', 'mylog');
    await page.click('[data-mytab="balance"]');
    const rows = page.locator('#view table').first().locator('tbody tr');
    await expect(rows).toHaveCount(9);

    const cells = rows.filter({ hasText: '特休' }).locator('td');
    await expect(cells.nth(1)).toContainText('120 h');   // 15 days
    await expect(cells.nth(2)).toHaveText('4 h');        // L234 approved
    await expect(cells.nth(4)).toContainText('116 h');

    const comp = rows.filter({ hasText: '補休' });
    await expect(comp.locator('td').nth(1)).toContainText('4 h');  // OT22 approved as comp time

    // a pending half day is held against the balance
    await page.click('[data-mytab="leave"]');
    await page.click('[data-quick="am"]');
    await page.fill('#leaveForm textarea[name="reason"]', 'e2e');
    await page.click('#leaveForm button[type="submit"]');
    await page.click('[data-mytab="balance"]');
    await expect(cells.nth(3)).toHaveText('4 h');
    await expect(cells.nth(4)).toContainText('112 h');
  });
});

/* ================================================================ */
test.describe('Payroll night-shift allowance', () => {
  test.beforeEach(async ({ page }) => { await openPortal(page); await setRole(page, 'hr'); await go(page, 'pay', 'run'); });

  test('rotating nurse is paid per evening / overnight shift and OT base includes it', async ({ page }) => {
    // E2203 in 2026-08: 5 evening + 1 overnight shifts, 3.5 h approved weekday overtime
    await page.click('[data-payemp="E2203"]');
    const d = drawer(page);
    await expect(d.locator('tr', { hasText: '小夜班津貼' })).toContainText('5 班 × 200');
    await expect(d.locator('tr', { hasText: '小夜班津貼' })).toContainText('NT$1,000');
    await expect(d.locator('tr', { hasText: '大夜班津貼' })).toContainText('NT$400');
    // (58,500 + 1,400) ÷ 240 = 249.58 → 2 h × 4/3 = 666
    await expect(d.locator('tr', { hasText: '平日加班（前 2 小時）' })).toContainText('249.58');
    await expect(d.locator('tr', { hasText: '平日加班（前 2 小時）' })).toContainText('NT$666');
  });

  test('day-shift staff get no allowance', async ({ page }) => {
    await page.click('[data-payemp="E1003"]');
    const d = drawer(page);
    await expect(d.locator('tr', { hasText: '本薪（月薪）' })).toBeVisible();
    await expect(d.locator('tr', { hasText: '小夜班津貼' })).toHaveCount(0);
    await expect(d.locator('tr', { hasText: '大夜班津貼' })).toHaveCount(0);
  });

  test('calculator adds allowance per shift and can exclude it from the OT base', async ({ page }) => {
    await go(page, 'pay', 'calc');
    await page.selectOption('#calcForm [name=empId]', { value: '' });
    const f = page.locator('#calcForm');
    await f.locator('[name=monthly]').fill('48000');
    await f.locator('[name=wd1]').fill('2');
    await f.locator('[name=night]').fill('4');
    await f.locator('[name=night]').dispatchEvent('input');
    const out = page.locator('#calcOut');
    await expect(out.locator('tr', { hasText: '大夜班津貼' })).toContainText('NT$1,600');
    // (48,000 + 1,600) ÷ 240 = 206.67 → 2 h × 4/3 = 551
    await expect(out.locator('tr', { hasText: '平日加班（前 2 小時）' })).toContainText('NT$551');
    await page.selectOption('#calcForm [name=nightInBase]', 'false');
    // 48,000 ÷ 240 = 200 → 2 h × 4/3 = 533
    await expect(out.locator('tr', { hasText: '平日加班（前 2 小時）' })).toContainText('NT$533');
  });

  test('calculator includes a part-timer\'s allowance in their OT rate', async ({ page }) => {
    await go(page, 'pay', 'calc');
    await page.selectOption('#calcForm [name=empId]', { value: '' });
    const f = page.locator('#calcForm');
    await page.selectOption('#calcForm [name=part]', 'true');
    await f.locator('[name=hourly]').fill('200');
    await f.locator('[name=regH]').fill('160');
    await f.locator('[name=wd1]').fill('2');
    await f.locator('[name=night]').fill('4');
    await f.locator('[name=night]').dispatchEvent('input');
    const out = page.locator('#calcOut');
    await expect(out.locator('tr', { hasText: '大夜班津貼' })).toContainText('NT$1,600');
    // (160 h × 200 + 1,600) ÷ 160 h = 210 → 2 h × 4/3 = 560
    await expect(out.locator('tr', { hasText: '平日加班（前 2 小時）' })).toContainText('NT$560');
  });

  test('leave is counted against the evening or overnight shift worked that day', async ({ page }) => {
    const r = await page.evaluate(() => ({
      // E2203 works overnight (00:00–08:00) on 2026-08-27 and evening (16:00–24:00) on 2026-08-21
      nightShift: leaveHours('2026-08-27', '00:00', '2026-08-27', '08:00', 'E2203'),
      nightFullDay: leaveHours('2026-08-27', '08:00', '2026-08-27', '17:00', 'E2203'),
      evePartial: leaveHours('2026-08-21', '13:00', '2026-08-21', '17:00', 'E2203'),
      dayStaff: leaveHours('2026-08-27', '13:00', '2026-08-27', '17:00', 'E1003'),
    }));
    expect(r).toEqual({ nightShift: 8, nightFullDay: 8, evePartial: 1, dayStaff: 4 });
  });

  test('partial leave on an overnight shift keeps the allowance', async ({ page }) => {
    const r = await page.evaluate(() => {
      // 4 h off at the end of E2203's 2026-08-27 overnight shift
      LEAVE.push(mkLeave('L900', 'E2203', 'personal', '2026-08-27', '04:00', '2026-08-27', '08:00', '2026-08-26', 'approved', { zh: '', en: '' }));
      const day = attendance('E2203', 2026, 8).find(x => x.d === 27);
      const inp = payInputs('E2203', '2026-08');
      // L238 is 08:00–12:00 on E2206's 2026-08-21 overnight shift, outside the hours worked
      const e2206 = payInputs('E2206', '2026-08');
      return { shift: day.shift, lvH: day.lvH, nights: inp.shiftDates.night, e2206Nights: e2206.shiftDates.night };
    });
    expect(r.shift).toBe('night');
    expect(r.lvH).toBe(4);
    expect(r.nights).toContain(27);
    expect(r.e2206Nights).toContain(21);
  });
});

/* ================================================================ */
test.describe('Personnel file drawer', () => {
  const SECS = {
    sum: '出勤摘要', basic: '薪資帳戶', hist: '任職與薪資異動',
    ins: '勞保', qual: '證照與資格', perf: '績效考核紀錄'
  };
  async function openRecord(page, role, id) {
    await openPortal(page);
    await setRole(page, role);
    await go(page, 'hr', 'emp');
    await page.click(`tr[data-emp="${id}"]`);
    await expect(drawer(page)).toBeVisible();
  }
  async function openSec(page, sec) {
    await page.click(`[data-sec="${sec}"]`);
    await expect(page.locator(`[data-sec="${sec}"]`)).toHaveAttribute('aria-pressed', 'true');
  }
  const body = page => page.locator('aside.drawer .drawer-b');

  test('every section renders and the drawer closes', async ({ page }) => {
    await openRecord(page, 'hr', 'E2103');
    await expect(page.locator('[data-sec]')).toHaveCount(6);
    for (const [sec, text] of Object.entries(SECS)) {
      await openSec(page, sec);
      await expect(body(page)).toContainText(text);
    }
    await page.click('aside.drawer button.x');
    await expect(drawer(page)).toHaveCount(0);
  });

  test('hr sees full ID, pay, bank account and insurance grades', async ({ page }) => {
    await openRecord(page, 'hr', 'E2103');
    await expect(body(page)).toContainText('NT$58,000');
    const idNo = await page.evaluate(() => empRecord('E2103').basic.idNo);
    await openSec(page, 'basic');
    await expect(body(page)).toContainText(idNo);
    await expect(body(page).locator('.lock')).toHaveCount(0);
    await openSec(page, 'hist');
    await expect(body(page)).toContainText('NT$');
    await openSec(page, 'ins');
    await expect(body(page)).toContainText('勞保投保薪資');
  });

  test('admin gets contact details but masked ID and locked pay', async ({ page }) => {
    await openRecord(page, 'admin', 'E2103');
    await expect(body(page)).toContainText('僅人資可見');
    const { idNo, mobile } = await page.evaluate(() => empRecord('E2103').basic);
    await openSec(page, 'basic');
    await expect(body(page)).not.toContainText(idNo);
    await expect(body(page)).toContainText('•'.repeat(idNo.length - 3) + idNo.slice(-3));
    await expect(body(page)).toContainText(mobile);
    await expect(body(page)).toContainText('薪資帳戶僅人資可見');
    await openSec(page, 'hist');
    await expect(body(page)).toContainText('•••');
    await expect(body(page)).not.toContainText('NT$');
    await openSec(page, 'ins');
    await expect(body(page)).toContainText('投保薪資與保費僅人資可見');
  });

  test('manager cannot see contact details or pay', async ({ page }) => {
    await openRecord(page, 'manager', 'E2103');
    const { mobile } = await page.evaluate(() => empRecord('E2103').basic);
    await openSec(page, 'basic');
    await expect(body(page)).not.toContainText(mobile);
    await expect(body(page).locator('.lock').first()).toContainText('受限');
    await expect(body(page)).toContainText('薪資帳戶僅人資可見');
  });

  test('manager opening an out-of-scope person gets no sections', async ({ page }) => {
    await openPortal(page);
    await setRole(page, 'manager');
    await go(page, 'ann', 'org');
    await page.click('[data-node="E2201"]');              // O2 director
    await expect(drawer(page)).toBeVisible();
    await expect(body(page)).toContainText('不在您目前的資料範圍內');
    await expect(page.locator('[data-sec]')).toHaveCount(0);
  });
});

/* ================================================================ */
test.describe('CSV exports', () => {
  const FILES = {
    attendance: ['出勤統計報表', '員工編號,姓名,職稱'],
    personnel: ['人事資料報表', '員工編號,姓名,職稱'],
    leave: ['差勤申請報表', '單號,類型,員工編號,姓名'],
    financial: ['財務報表', '員工編號,姓名,據點,部門,計薪方式,應發金額']
  };
  async function download(page, type) {
    const [dl] = await Promise.all([
      page.waitForEvent('download'),
      page.click(`[data-export="${type}"]`)
    ]);
    const text = fs.readFileSync(await dl.path(), 'utf8');
    return { name: dl.suggestedFilename(), text, lines: text.replace(/^﻿/, '').split('\n') };
  }
  const col = (lines, header) => {
    const i = lines[0].split(',').indexOf(header);
    return lines.slice(1).map(l => l.split(',')[i]);
  };

  test.beforeEach(async ({ page }) => { await openPortal(page); });

  for (const [type, [prefix, header]] of Object.entries(FILES)) {
    test(`${type} report downloads with a BOM and header`, async ({ page }) => {
      await setRole(page, 'hr');
      await go(page, 'rpt');
      const { name, text, lines } = await download(page, type);
      expect(name).toBe(`${prefix}_2026-09.csv`);
      expect(text.charCodeAt(0)).toBe(0xFEFF);
      expect(lines[0].startsWith(header)).toBe(true);
      expect(lines.length).toBeGreaterThan(1);
    });
  }

  test('month selector changes filename and content', async ({ page }) => {
    await setRole(page, 'hr');
    await go(page, 'rpt');
    await page.selectOption('#reportMonth', '2026-08');
    const { name, lines } = await download(page, 'leave');
    expect(name).toBe('差勤申請報表_2026-08.csv');
    const ids = lines.slice(1).map(l => l.split(',')[0]);
    expect(ids).toContain('L231');
    expect(ids).not.toContain('L241');
  });

  test('personnel report masks salary for admin, not for hr', async ({ page }) => {
    await go(page, 'rpt');
    let { lines } = await download(page, 'personnel');
    expect(new Set(col(lines, '薪資'))).toEqual(new Set(['受限']));

    await setRole(page, 'hr');
    ({ lines } = await download(page, 'personnel'));
    expect(col(lines, '薪資').every(v => /^\d+$/.test(v))).toBe(true);
  });

  for (const role of ['admin', 'manager']) {
    test(`${role} cannot export the payroll (financial) report`, async ({ page }) => {
      await setRole(page, role);
      await go(page, 'rpt');
      await expect(page.locator('[data-export="financial"]')).toHaveCount(0);
      await expect(page.locator('#view')).toContainText('僅人資可匯出薪資資料');
      await expect(page.locator('[data-export="attendance"]')).toBeVisible();
    });
  }

  test('manager exports contain only O1 staff', async ({ page }) => {
    await setRole(page, 'manager');
    await go(page, 'rpt');
    const { lines } = await download(page, 'attendance');
    const ids = col(lines, '員工編號');
    expect(ids).toHaveLength(8);
    expect(ids.every(id => id.startsWith('E21'))).toBe(true);
  });

  test('leave report reflects an approval made in the session', async ({ page }) => {
    await setRole(page, 'manager');
    await go(page, 'hr', 'leave');
    await requestRow(page, 'L241').locator('[data-act="approve"]').click();
    await go(page, 'rpt');
    const { lines } = await download(page, 'leave');
    expect(lines.find(l => l.startsWith('L241,'))).toContain('待人資複核');
  });
});


/* ================================================================ */
/* v2.2 — items from the 30 Sept meeting                            */
test.describe('v2.2 meeting updates', () => {
  async function openRecord(page, role, id) {
    await openPortal(page);
    await setRole(page, role);
    await go(page, 'hr', 'emp');
    await page.click(`tr[data-emp="${id}"]`);
    await expect(drawer(page)).toBeVisible();
  }
  const body = page => page.locator('aside.drawer .drawer-b');

  test('employee numbers are unique and every employee starts Active', async ({ page }) => {
    await openPortal(page);
    const r = await page.evaluate(() => ({
      ids: STAFF.map(s => s.id),
      statuses: [...new Set(STAFF.map(s => statusOf(s.id)))],
      bases: [...new Set(STAFF.map(s => payBasisOf(s.id)))]
    }));
    expect(new Set(r.ids).size).toBe(r.ids.length);
    expect(r.statuses).toEqual(['active']);
    expect(r.bases.sort()).toEqual(['hourly', 'monthly']);
  });

  test('employee list shows pay basis and status, and filters by status', async ({ page }) => {
    await openPortal(page);
    await setRole(page, 'hr');
    await go(page, 'hr', 'emp');
    const total = await empRows(page).count();
    await expect(page.locator('#view [data-status="active"]')).toHaveCount(total);
    await expect(page.locator('#view [data-paybasis="hourly"]')).toHaveCount(2);   // E2107, E2206
    await page.evaluate(() => { empRecord('E2103').status = 'loa'; empRecord('E2104').status = 'exited'; render(); });
    await page.selectOption('#empStatus', 'loa');
    await expect(empRows(page)).toHaveCount(1);
    await expect(empRows(page).first()).toContainText('E2103');
    await page.selectOption('#empStatus', 'exited');
    await expect(empRows(page)).toHaveCount(1);
    await page.selectOption('#empStatus', 'ALL');
    await expect(empRows(page)).toHaveCount(total);
  });

  test('HR records a status change and it lands in the employment history', async ({ page }) => {
    await openRecord(page, 'hr', 'E2103');
    await page.click('[data-sec="hist"]');
    await page.locator('details.addbox summary').first().click();
    await page.selectOption('form[data-add="emp"] select[name="status"]', 'loa');
    await page.click('form[data-add="emp"] button[type="submit"]');
    await expect(body(page)).toContainText('留職停薪');
    const r = await page.evaluate(() => ({ s: empRecord('E2103').status, last: empRecord('E2103').hist.slice(-1)[0].kind }));
    expect(r).toEqual({ s: 'loa', last: 'leave' });
  });

  test('transfer keeps seniority; rehire after leaving restarts it', async ({ page }) => {
    await openRecord(page, 'hr', 'E2103');
    await page.click('[data-sec="hist"]');
    await page.locator('details.addbox summary').nth(1).click();
    await page.selectOption('form[data-add="hist"] select[name="kind"]', 'transfer');
    await page.click('form[data-add="hist"] button[type="submit"]');
    const afterTransfer = await page.evaluate(() => ({ from: seniorityFrom('E2103'), hired: person('E2103').hired, id: 'E2103' }));
    expect(afterTransfer.from).toBe(afterTransfer.hired);

    // leave, then come back
    await page.locator('details.addbox summary').first().click();
    await page.selectOption('form[data-add="emp"] select[name="status"]', 'exited');
    await page.click('form[data-add="emp"] button[type="submit"]');
    expect(await page.evaluate(() => empRecord('E2103').status)).toBe('exited');
    await page.locator('details.addbox summary').first().click();
    await page.selectOption('form[data-add="emp"] select[name="status"]', 'active');
    await page.click('form[data-add="emp"] button[type="submit"]');
    const rehired = await page.evaluate(() => ({ s: empRecord('E2103').status, from: seniorityFrom('E2103'), hired: person('E2103').hired }));
    expect(rehired.s).toBe('active');
    expect(rehired.from).toBe('2026-09-08');          // the fixed demo date, not the original hire date
    expect(rehired.from).not.toBe(rehired.hired);
  });

  test('annual leave days follow the seniority start date', async ({ page }) => {
    await openPortal(page);
    const r = await page.evaluate(() => {
      const before = leaveBalance('E2103').find(b => b.k === 'annual').quotaH;
      empRecord('E2103').seniorityFrom = '2026-06-01';          // 3 months of service → no annual leave yet
      const after = leaveBalance('E2103').find(b => b.k === 'annual').quotaH;
      return { before, after };
    });
    expect(r.before).toBeGreaterThan(0);
    expect(r.after).toBe(0);
  });

  test('second emergency contact is optional; first is required', async ({ page }) => {
    await openRecord(page, 'hr', 'E2103');
    await page.click('[data-sec="basic"]');
    await expect(body(page)).toContainText('緊急聯絡人 1');
    await expect(body(page)).toContainText('緊急聯絡人 2');
    await page.click('[data-edit="basic"]');
    await expect(page.locator('input[name="emerName"]')).toHaveAttribute('required', '');
    await expect(page.locator('input[name="emerPhone"]')).toHaveAttribute('required', '');
    await expect(page.locator('input[name="emer2Name"]')).not.toHaveAttribute('required', '');
  });

  test('cash pay hides bank details; admin cannot see the pay method', async ({ page }) => {
    await openRecord(page, 'hr', 'E2103');
    await page.click('[data-sec="basic"]');
    await page.click('[data-edit="basic"]');
    await page.selectOption('select[name="payMethod"]', 'cash');
    await page.click('form[data-save="basic"] button[type="submit"]');
    await expect(body(page)).toContainText('現金領取');
    await expect(body(page)).not.toContainText('帳號');
    await page.click('button.x');
    await setRole(page, 'admin');
    await page.click('tr[data-emp="E2103"]');
    await page.click('[data-sec="basic"]');
    await expect(body(page)).toContainText('薪資帳戶僅人資可見');
    await expect(body(page)).not.toContainText('現金領取');
  });

  test('revenue-share staff are excluded from auto payroll with a visible warning', async ({ page }) => {
    await openPortal(page);
    const r = await page.evaluate(() => {
      const monthly = calcPay('E2203', '2026-08').gross;
      empRecord('E2203').payBasis = 'split';
      const res = calcPay('E2203', '2026-08');
      return { monthly, gross: res.gross, net: res.net, split: res.split, warn: res.warn.map(w => w.zh), csv: payCSV(allPay('2026-08'), '2026-08').split('\n').find(l => l.startsWith('E2203,')) };
    });
    expect(r.monthly).toBeGreaterThan(0);
    expect(r.gross).toBe(0);
    expect(r.net).toBe(0);
    expect(r.split).toBe(true);
    expect(r.warn[0]).toContain('拆帳制');
    expect(r.csv).toContain(',拆帳,');
  });

  test('every report carries both the employee number and the Chinese name', async ({ page }) => {
    await openPortal(page);
    await setRole(page, 'hr');
    const r = await page.evaluate(() => {
      const head = csv => csv.split('\n')[0].split(',');
      return {
        att: head(generateAttendanceReport('2026-09')), per: head(generatePersonnelReport('2026-09')),
        lv: head(generateLeaveReport('2026-09')), fin: head(generateFinancialReport('2026-09')),
        name: empName('E2103'), attRow: generateAttendanceReport('2026-09').split('\n').find(l => l.startsWith('E2103,'))
      };
    });
    for (const h of [r.att, r.per, r.lv, r.fin]) {
      expect(h).toContain('員工編號');
      expect(h).toContain('姓名');
    }
    expect(r.attRow.split(',')[1]).toBe(r.name);
  });

  test('personnel report exports status, seniority start and pay basis', async ({ page }) => {
    await openPortal(page);
    await setRole(page, 'hr');
    await go(page, 'rpt');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-export="personnel"]')]);
    const lines = fs.readFileSync(await dl.path(), 'utf8').replace(/^﻿/, '').split('\n');
    const head = lines[0].split(',');
    for (const h of ['年資起算日', '僱用狀態', '計薪方式', '緊急聯絡人1', '緊急聯絡人2', '領薪方式']) expect(head).toContain(h);
    const statusCol = head.indexOf('僱用狀態');
    expect(new Set(lines.slice(1).map(l => l.split(',')[statusCol]))).toEqual(new Set(['在職']));
  });

  test('employee-number proposal and the 9/30 open items are on screen', async ({ page }) => {
    await openPortal(page);
    await go(page, 'set');
    await expect(page.locator('#idRule')).toContainText('CSHR');
    await expect(page.locator('#idRule')).toContainText('尚未核定');
    await go(page, 'perm', 'open');
    await expect(page.locator('#meeting0930')).toContainText('10/7');
    await expect(page.locator('#meeting0930 tbody tr')).toHaveCount(7);
    await expect(page.locator('#meeting0930')).toContainText('拆帳');
  });
});
