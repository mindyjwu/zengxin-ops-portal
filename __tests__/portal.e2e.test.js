/**
 * End-to-end UI tests for the 誠馨日照 operations portal (ltc-portal.html).
 *
 * The page is a single-file prototype with in-memory data and a fixed demo
 * date of 2026-09-08. Built roles: admin (H005, HQ), hr (H003, HQ),
 * manager (A001, director of O1 竹北日照中心) and employee (A004, care
 * attendant at O1, self-service 私人秘書 only).
 */

const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');

const PORTAL = 'file://' + path.resolve(__dirname, '../ltc-portal.html') + '?demoDate=2026-09-08';

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
    await expect(chip).toContainText('人資');
    await setRole(page, 'manager');
    await expect(chip).toContainText('日照主管');
  });

  test('the top bar stays on a single line on desktop widths, in both languages', async ({ page }) => {
    for (const w of [1920, 1440, 1280, 1100]) {
      await page.setViewportSize({ width: w, height: 800 });
      for (const lang of ['zh', 'en']) {
        await page.click(`[data-lang="${lang}"]`);
        for (const role of ['admin', 'hr', 'manager', 'employee']) {
          await setRole(page, role);
          const r = await page.evaluate(() => {
            const u = document.querySelector('.utility'), kids = [...u.children].filter(k => k.getBoundingClientRect().width > 0);
            const mids = kids.map(k => { const b = k.getBoundingClientRect(); return b.top + b.height / 2; });
            return { h: u.getBoundingClientRect().height, spread: Math.max(...mids) - Math.min(...mids), over: u.scrollWidth > u.clientWidth + 1 };
          });
          expect(r.h, `${w} ${lang} ${role} height`).toBeLessThan(64);
          expect(r.spread, `${w} ${lang} ${role} rows`).toBeLessThan(10);
          expect(r.over, `${w} ${lang} ${role} overflow`).toBe(false);
        }
      }
    }
    await page.click('[data-lang="zh"]');
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

  test('admin and hr see all 28 employees', async ({ page }) => {
    await go(page, 'hr', 'emp');
    await expect(empRows(page)).toHaveCount(28);
    await setRole(page, 'hr');
    await expect(empRows(page)).toHaveCount(28);
  });

  test('manager sees only O1 staff and the office filter is locked', async ({ page }) => {
    await setRole(page, 'manager');
    await go(page, 'hr', 'emp');
    await expect(empRows(page)).toHaveCount(10);   // 誠馨: day care, home care and community center staff
    const ids = await empRows(page).evaluateAll(rs => rs.map(r => r.dataset.emp));
    expect(ids.every(id => id.startsWith('A'))).toBe(true);
    await expect(page.locator('#view tbody')).not.toContainText('誠芯');
    await expect(page.locator('#offSel')).toBeDisabled();
    await expect(page.locator('#view .note.q')).toContainText('隱藏了 18 位');
  });

  test('assumption toggle opens the manager to every facility', async ({ page }) => {
    await setRole(page, 'manager');
    await go(page, 'hr', 'emp');
    await page.click('#assumeBtn');
    await expect(page.locator('#assumeBtn')).toHaveAttribute('aria-pressed', 'true');
    await expect(empRows(page)).toHaveCount(28);
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
    await expect(page.locator('#view')).toContainText('誠馨');
    await expect(page.locator('#view')).not.toContainText('誠芯');

    await page.click('[data-tab="leave"]');
    await expect(requestRow(page, 'L241')).toHaveCount(1);   // A003, O1
    await expect(requestRow(page, 'L245')).toHaveCount(0);   // B003, O2
    await expect(requestRow(page, 'L234')).toHaveCount(0);   // H005, HQ
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
    const net = await page.evaluate(() => calcPay('A004', '2026-08').net);
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
    await expect(page.locator('#view tbody tr')).toHaveCount(6);   // day care staff reporting to the 誠馨 supervisor
  });

  test('who-is-out shows only colleagues’ names', async ({ page }) => {
    await setRole(page, 'employee');
    await page.click('[data-pday="2026-09-18"]');                  // A007 family-care leave (L243)
    const name = await page.evaluate(() => empName('A007'));
    const box = page.locator('.peerbox', { hasText: '部門同事' });
    await expect(box).toContainText(name);
    for (const hidden of ['家庭照顧假', '照服員', '審核中', '請假 ·', '公出']) await expect(box).not.toContainText(hidden);
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
    const pay = page.locator('tr[data-emp="A003"] td').last();
    await expect(pay).toHaveText('NT$58,000');
    await expect(page.locator('#view tbody .lock')).toHaveCount(0);
  });

  for (const role of ['admin', 'manager']) {
    test(`${role} sees the lock instead of pay`, async ({ page }) => {
      await setRole(page, role);
      const pay = page.locator('tr[data-emp="A003"] td').last();
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

  test('rotating staff can request leave for evening shifts; there is no overnight shift', async ({ page }) => {
    await openPortal(page);
    // No built role works rotating shifts, so point admin's persona at nurse B003 (O2).
    await page.evaluate(() => { ROLES.admin.persona = 'B003'; render(); });
    await go(page, 'hr', 'mylog');
    await page.click('[data-mytab="leave"]');
    const f = page.locator('#leaveForm'), calc = page.locator('#leaveCalc');
    const slots = await f.locator('select[name="fromT"] option').evaluateAll(os => os.map(o => o.value));
    expect(slots[0]).toBe('00:00');
    expect(slots[slots.length - 1]).toBe('24:00');

    // 2026-08-27 would have been an overnight shift; with no overnight shift it is a day shift
    await f.locator('[name=from]').fill('2026-08-27');
    await expect(page.locator('#leaveShift')).toContainText('白班');
    await page.click('[data-quick="full"]');
    await expect(f.locator('[name=fromT]')).toHaveValue('08:00');
    await expect(f.locator('[name=toT]')).toHaveValue('17:00');
    await expect(calc).toContainText('8 小時');
    await page.click('[data-quick="am"]');
    await expect(f.locator('[name=toT]')).toHaveValue('12:00');
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
    await openPortal(page);                              // admin = H005, hired 2021-08-01
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

  test('rotating nurse is paid per evening shift and OT base includes it', async ({ page }) => {
    // B003 in 2026-08: 5 evening shifts (no overnight shift), 3.5 h approved weekday overtime
    await page.selectOption('#payMonth', '2026-08');
    await page.click('[data-payemp="B003"]');
    const d = drawer(page);
    await expect(d.locator('tr', { hasText: '小夜班津貼' })).toContainText('5 班 × 200');
    await expect(d.locator('tr', { hasText: '小夜班津貼' })).toContainText('NT$1,000');
    await expect(d.locator('tr', { hasText: '大夜班津貼' })).toHaveCount(0);
    // (58,500 + 1,000) ÷ 240 = 247.92 → 2 h × 4/3 = 661
    await expect(d.locator('tr', { hasText: '平日加班（前 2 小時）' })).toContainText('247.92');
    await expect(d.locator('tr', { hasText: '平日加班（前 2 小時）' })).toContainText('NT$661');
  });

  test('no overnight shifts are rostered while the center has none', async ({ page }) => {
    const nights = await page.evaluate(() => STAFF.reduce((a, s) => a + ['2026-06', '2026-07', '2026-08', '2026-09']
      .reduce((b, m) => b + attendance(s.id, +m.slice(0, 4), +m.slice(5)).filter(x => x.shift === 'night').length, 0), 0));
    expect(nights).toBe(0);
    await go(page, 'pay', 'calc');
    await expect(page.locator('#calcForm [name=night]')).toHaveAttribute('type', 'hidden');
    await expect(page.locator('#calcForm')).not.toContainText('大夜班次');
  });

  test('day-shift staff get no allowance', async ({ page }) => {
    await page.click('[data-payemp="H003"]');
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
    await f.locator('[name=eve]').fill('4');
    await f.locator('[name=eve]').dispatchEvent('input');
    const out = page.locator('#calcOut');
    await expect(out.locator('tr', { hasText: '小夜班津貼' })).toContainText('NT$800');
    // (48,000 + 800) ÷ 240 = 203.33 → 2 h × 4/3 = 542
    await expect(out.locator('tr', { hasText: '平日加班（前 2 小時）' })).toContainText('NT$542');
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
    await f.locator('[name=eve]').fill('4');
    await f.locator('[name=eve]').dispatchEvent('input');
    const out = page.locator('#calcOut');
    await expect(out.locator('tr', { hasText: '小夜班津貼' })).toContainText('NT$800');
    // (160 h × 200 + 800) ÷ 160 h = 205 → 2 h × 4/3 = 547
    await expect(out.locator('tr', { hasText: '平日加班（前 2 小時）' })).toContainText('NT$547');
  });

  test('leave is counted against the evening or overnight shift worked that day', async ({ page }) => {
    await page.evaluate(() => { NIGHT_SHIFT = true; });   // overnight support stays ready for when one opens
    const r = await page.evaluate(() => ({
      // B003 works overnight (00:00–08:00) on 2026-08-27 and evening (16:00–24:00) on 2026-08-21
      nightShift: leaveHours('2026-08-27', '00:00', '2026-08-27', '08:00', 'B003'),
      nightFullDay: leaveHours('2026-08-27', '08:00', '2026-08-27', '17:00', 'B003'),
      evePartial: leaveHours('2026-08-21', '13:00', '2026-08-21', '17:00', 'B003'),
      dayStaff: leaveHours('2026-08-27', '13:00', '2026-08-27', '17:00', 'H003'),
    }));
    expect(r).toEqual({ nightShift: 8, nightFullDay: 8, evePartial: 1, dayStaff: 4 });
  });

  test('partial leave on an overnight shift keeps the allowance', async ({ page }) => {
    await page.evaluate(() => { NIGHT_SHIFT = true; });
    const r = await page.evaluate(() => {
      // 4 h off at the end of B003's 2026-08-27 overnight shift
      LEAVE.push(mkLeave('L900', 'B003', 'personal', '2026-08-27', '04:00', '2026-08-27', '08:00', '2026-08-26', 'approved', { zh: '', en: '' }));
      const day = attendance('B003', 2026, 8).find(x => x.d === 27);
      const inp = payInputs('B003', '2026-08');
      // L238 is 08:00–12:00 on B006's 2026-08-21 overnight shift, outside the hours worked
      const e2206 = payInputs('B006', '2026-08');
      return { shift: day.shift, lvH: day.lvH, nights: inp.shiftDates.night, e2206Nights: e2206.shiftDates.night };
    });
    expect(r.shift).toBe('night');
    expect(r.lvH).toBe(4);
    expect(r.nights).toContain(27);
    expect(r.e2206Nights).toContain(21);
  });
});

/* ================================================================ */
test.describe('Grounded content (9/20 meeting minutes, deck, v2.0 spec)', () => {
  const BARE = 'file://' + path.resolve(__dirname, '../ltc-portal.html');

  test('without a demoDate the demo date is 2026-10-07 and holidays are days off', async ({ page }) => {
    await page.goto(BARE);
    await expect(page.locator('.rail-foot')).toContainText('2026-10-07');
    await setRole(page, 'employee');
    await expect(page.locator('[data-dday="2026-10-07"]')).toHaveCount(1);          // the home calendar opens on the demo month
    const status = await page.evaluate(() => [25, 28].map(d => attendance('A004', 2026, 9)[d - 1].status));
    expect(status).toEqual(['off', 'off']);                                       // 中秋節、孔子誕辰紀念日
    expect(await page.evaluate(() => [HOLIDAYS['2026-09-25'], HOLIDAYS['2026-09-28']])).toEqual(['中秋節', '孔子誕辰紀念日']);
  });

  test('payroll, attendance and reports open on the month of the demo date', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(BARE);
    await setRole(page, 'hr');
    await go(page, 'pay', 'run');
    await expect(page.locator('#payMonth')).toHaveValue('2026-10');
    await expect(page.locator('tr[data-payemp]').first()).toBeVisible();
    await go(page, 'pay', 'calc');
    await expect(page.locator('#calcForm')).toBeVisible();
    await go(page, 'pay', 'ver');
    await go(page, 'hr', 'att');
    await expect(page.locator('#attMon')).toHaveValue('2026-10');
    await go(page, 'rpt');
    await expect(page.locator('#reportMonth')).toHaveValue('2026-10');
    expect(errors).toEqual([]);
    // with an explicit earlier demo date the defaults follow it
    await page.goto(PORTAL);
    await setRole(page, 'hr');
    await go(page, 'pay', 'run');
    await expect(page.locator('#payMonth')).toHaveValue('2026-09');
  });

  test('three companies in greater Hsinchu, with the current company labelled', async ({ page }) => {
    await openPortal(page);
    const opts = await page.locator('#offSel option').evaluateAll(os => os.map(o => o.textContent));
    for (const c of ['誠馨', '誠芯', '牛津']) expect(opts.some(o => o.includes(c))).toBe(true);
    await expect(page.locator('.pagehead .chip.warn')).toContainText('全部公司');
    await page.selectOption('#offSel', 'O3');
    await expect(page.locator('.pagehead .chip.warn')).toContainText('牛津');
    await setRole(page, 'manager');
    await expect(page.locator('.pagehead .chip.warn')).toContainText('誠馨');
  });

  test('no page shows the removed, unsourced content', async ({ page }) => {
    await openPortal(page);
    const banned = ['竹北日照中心', '竹東日照中心', '康禾', '營運長', '執行長', '評鑑準備', '流感疫苗', '仁仁', '7 個', '住民', '人保'];
    // 「院長」只出現在 9/30 會議紀錄的原文引用（會議紀錄頁與角色頁），其他頁面不應出現
    const mayQuote = (m, tab) => (m === 'doc' && tab === 'meeting') || (m === 'arch' && tab === 'roles');
    for (const role of ['admin', 'hr', 'manager', 'employee']) {
      await setRole(page, role);
      const mods = await page.locator('[data-mod]').evaluateAll(n => n.map(x => x.dataset.mod));
      for (const m of mods) {
        await page.click(`[data-mod="${m}"]`);
        const tabs = await page.locator('[data-tab]').evaluateAll(n => n.map(x => x.dataset.tab));
        for (const tab of tabs.length ? tabs : [null]) {
          if (tab) await page.click(`[data-tab="${tab}"]`);
          const text = await page.locator('#app').innerText();
          for (const w of banned) expect(text, `${role} ${m}:${tab} shows ${w}`).not.toContain(w);
          if (!mayQuote(m, tab)) expect(text, `${role} ${m}:${tab} shows 院長`).not.toContain('院長');
        }
      }
    }
  });

  test('meeting minutes, existing-system links and the revenue-share pay system', async ({ page }) => {
    await openPortal(page);
    await go(page, 'doc', 'meeting');
    await expect(page.locator('#view')).toContainText('入口網站建置第一次需求討論會議');
    await expect(page.locator('#view')).toContainText('拆帳制');
    await go(page, 'set');
    await expect(page.locator('#view a[href="https://pro.104.com.tw/"]')).toHaveCount(1);
    await expect(page.locator('#view')).toContainText('居服個案管理系統（仁寶）');
    await setRole(page, 'hr');
    await go(page, 'pay', 'calc');
    await page.selectOption('#calcForm [name=part]', 'split');
    await expect(page.locator('#calcOut')).toContainText('拆帳制的計薪規則');
  });

  test('a manager fills in a mid-year review from the team reviews page', async ({ page }) => {
    await openPortal(page);
    await setRole(page, 'manager');
    await page.click('[data-mod="desk"]');
    await page.click('[data-tab="query"]');
    await page.click('[data-dq="subperf"]');
    const tile = page.locator('.tile', { hasText: '期中考核' });
    await expect(tile).toContainText('0 / 6');
    await page.locator('[data-perfemp="A003"]').click();
    const form = page.locator('form[data-add="perf"]');
    await expect(form).toBeVisible();
    await form.locator('select[name="period"]').selectOption({ index: 0 });
    await form.locator('input[name="score"]').fill('88');
    await form.locator('button[type="submit"]').click();
    await expect(page.locator('aside.drawer .drawer-b')).toContainText('期中考核（上半年）');
    await page.click('aside.drawer button.x');
    await expect(tile).toContainText('1 / 6');
    await expect(page.locator('#view tr', { hasText: 'A003' })).toContainText('已完成');
  });

  test('a walkthrough switches role and page and highlights each step', async ({ page }) => {
    await page.goto(PORTAL + '&tour=leave');
    await expect(page.locator('.coach')).toContainText('員工：請假');
    await expect(page.locator('#roleSel')).toHaveValue('employee');
    await expect(page.locator('#leaveForm.tour-hl')).toHaveCount(1);
    const n = await page.evaluate(() => TOURS.find(t => t.id === 'leave').steps.length);
    for (let i = 1; i < n; i++) {
      await page.click('[data-tourstep="1"]');
      await expect(page.locator('.tour-hl')).toHaveCount(1);
    }
    await page.click('[data-tourstep="1"]');
    await expect(page.locator('.coach')).toHaveCount(0);
  });

  test('every walkthrough step finds what it points at', async ({ page }) => {
    await openPortal(page);
    const tours = await page.evaluate(() => TOURS.map(t => ({ id: t.id, n: t.steps.length })));
    for (const t of tours) {
      await page.click('#tourBtn');
      await page.click(`[data-tourgo="${t.id}"]`);
      for (let i = 0; i < t.n; i++) {
        await expect(page.locator('.tour-hl'), `${t.id} step ${i + 1}`).toHaveCount(1);
        await page.click('[data-tourstep="1"]');
      }
    }
  });

  test('the user guide links only to walkthroughs that exist', async ({ page }) => {
    await page.goto('file://' + path.resolve(__dirname, '../guide.html'));
    await expect(page.locator('h1')).toContainText('使用指南');
    const ids = await page.locator('a[href*="tour="]').evaluateAll(as => as.map(a => new URL(a.href).searchParams.get('tour')));
    expect(ids.length).toBeGreaterThan(5);
    await page.goto(PORTAL);
    const known = await page.evaluate(() => TOURS.map(t => t.id));
    for (const id of ids) expect(known).toContain(id);
  });
});

/* ================================================================ */
test.describe('Updates from the 9/30 meeting', () => {
  test.beforeEach(async ({ page }) => { await openPortal(page); });

  test('the minutes page holds the 9/30 notes, the next meeting and the follow-ups', async ({ page }) => {
    await go(page, 'doc', 'meeting');
    const v = page.locator('#view');
    await expect(v).toContainText('9/30 會議');
    await expect(v).toContainText('在職狀態三種：在職、留職停薪、離職');
    await expect(v).toContainText('可支撐未來 2,000 名員工');
    await expect(v).toContainText('10/7（三）11:30');
    await expect(v).toContainText('仁寶');            // 9/20 name
    await expect(v).not.toContainText('人保');        // the system is always called 仁寶
    await expect(v).toContainText('用字更正');
    await expect(v).toContainText('入口網站建置第一次需求討論會議');
    const ev = await page.evaluate(() => EVENTS.some(e => e.d === '2026-10-07'));
    expect(ev).toBe(true);
  });

  test('decisions page lists the 9/30 decisions with where they are', async ({ page }) => {
    await go(page, 'arch', 'scope');
    const rows = page.locator('#view tbody tr', { hasText: '員工編號前綴' });
    await expect(rows.first()).toContainText('9/30');
    await expect(page.locator('#view')).toContainText('員工個別');
    await expect(page.locator('#view')).toContainText('報表匯出支援 CSV 或 Excel');
  });

  test('104 comparison tab compares item by item and flags job types', async ({ page }) => {
    await go(page, 'doc', 'cmp104');
    const v = page.locator('#view');
    await expect(v).toContainText('排班模組');
    await expect(v).toContainText('104 未啟用');
    await expect(v).toContainText('自訂表單');
    await expect(v).toContainText('總務');              // a 104 job type the prototype does not have
    await expect(v).toContainText('系統管理員、日照主管、司機');
    const counts = await page.locator('#view .tiles .v').allInnerTexts();
    expect(counts.map(Number).reduce((a, b) => a + b, 0)).toBeGreaterThan(30);
  });

  test('employment status: three kinds, shown in the table and counted', async ({ page }) => {
    await setRole(page, 'hr');
    await go(page, 'hr', 'emp');
    await expect(page.locator('tr[data-emp="B009"]')).toContainText('留職停薪');
    await expect(page.locator('tr[data-emp="C003"]')).toContainText('離職');
    await expect(page.locator('tr[data-emp="A004"]')).toContainText('在職');
    await expect(page.locator('#view .tile', { hasText: '在職' }).first()).toContainText('留職停薪 1 · 離職 1');
  });

  test('unpaid leave and resignation drop out of payroll from the effective month', async ({ page }) => {
    await setRole(page, 'hr');
    await go(page, 'pay', 'run');
    await page.selectOption('#payMonth', '2026-07');
    await expect(page.locator('tr[data-payemp="B009"]')).toHaveCount(1);
    await page.selectOption('#payMonth', '2026-08');
    await expect(page.locator('tr[data-payemp="B009"]')).toHaveCount(0);
    await expect(page.locator('tr[data-payemp="C003"]')).toHaveCount(1);
    await expect(page.locator('#view .note', { hasText: '不列入試算' })).toContainText('留職停薪');
    await page.selectOption('#payMonth', '2026-09');
    await expect(page.locator('tr[data-payemp="C003"]')).toHaveCount(0);
  });

  test('HR changes a status and the person leaves the roster', async ({ page }) => {
    await setRole(page, 'hr');
    await go(page, 'hr', 'emp');
    await page.click('tr[data-emp="A008"]');
    await expect(drawer(page)).toBeVisible();
    await page.click('aside.drawer details.addbox summary >> nth=0');
    const form = page.locator('aside.drawer form[data-add="status"]');
    await form.locator('select[name="status"]').selectOption('left');
    await form.locator('input[name="date"]').fill('2026-08-01');
    await form.locator('button[type="submit"]').click();
    await expect(page.locator('aside.drawer .drawer-b')).toContainText('離職');
    await page.click('aside.drawer [data-sec="hist"]');
    await expect(page.locator('aside.drawer .drawer-b')).toContainText('2026-08-01');
    await page.click('aside.drawer button.x');
    await expect(page.locator('tr[data-emp="A008"]')).toContainText('離職');
    await go(page, 'pay', 'run');
    await page.selectOption('#payMonth', '2026-08');
    await expect(page.locator('tr[data-payemp="A008"]')).toHaveCount(0);
  });

  test('personnel file: two emergency contacts, license upload and training records', async ({ page }) => {
    await setRole(page, 'hr');
    await go(page, 'hr', 'emp');
    await page.click('tr[data-emp="A002"]');
    await page.click('aside.drawer [data-sec="basic"]');
    await expect(page.locator('aside.drawer .drawer-b')).toContainText('第二位緊急聯絡人');
    await page.click('aside.drawer [data-sec="qual"]');
    await expect(page.locator('aside.drawer .drawer-b')).toContainText('教育訓練記錄');
    await expect(page.locator('aside.drawer form[data-add="lic"] input[type="file"]')).toHaveCount(1);
    await expect(page.locator('aside.drawer form[data-add="train"]')).toHaveCount(1);
    await page.click('aside.drawer button.x');
    await page.click('tr[data-emp="A003"]');                     // odd number: no second contact
    await page.click('aside.drawer [data-sec="basic"]');
    await expect(page.locator('aside.drawer .drawer-b')).not.toContainText('第二位緊急聯絡人');
  });

  test('the first emergency contact is required when editing', async ({ page }) => {
    await setRole(page, 'hr');
    await go(page, 'hr', 'emp');
    await page.click('tr[data-emp="A003"]');
    await page.click('aside.drawer [data-sec="basic"]');
    await page.click('aside.drawer [data-edit="basic"]');
    await expect(page.locator('input[name="emerName"]')).toHaveAttribute('required', '');
    await expect(page.locator('input[name="emer2Name"]')).not.toHaveAttribute('required', '');
  });

  test('every report lists both the employee number and the Chinese name', async ({ page }) => {
    await setRole(page, 'hr');
    await go(page, 'rpt');
    for (const type of ['attendance', 'personnel', 'leave', 'financial']) {
      const [dl] = await Promise.all([page.waitForEvent('download'), page.click(`[data-export="${type}"]`)]);
      const head = fs.readFileSync(await dl.path(), 'utf8').replace(/^﻿/, '').split('\n')[0].split(',');
      expect(head, type).toContain('員工編號');
      expect(head, type).toContain('姓名');
    }
  });

  test('reports can be downloaded as a real Excel (.xlsx) file', async ({ page }) => {
    await setRole(page, 'hr');
    await go(page, 'rpt');
    await page.selectOption('#reportFmt', 'xlsx');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-export="attendance"]')]);
    expect(dl.suggestedFilename()).toBe('出勤統計報表_2026-09.xlsx');
    const buf = fs.readFileSync(await dl.path());
    expect(buf.subarray(0, 2).toString()).toBe('PK');                 // zip container
    const text = buf.toString('utf8');
    for (const part of ['[Content_Types].xml', 'xl/workbook.xml', 'xl/worksheets/sheet1.xml', '員工編號', 'A001']) expect(text).toContain(part);
    // the zip is well formed: end-of-central-directory record counts 5 entries
    const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 5, 6]));
    expect(eocd).toBeGreaterThan(0);
    expect(buf.readUInt16LE(eocd + 10)).toBe(5);
    // employee numbers stay text and counts stay numbers
    const sheet = text.slice(text.indexOf('<sheetData>'));
    expect(sheet).toMatch(/<c r="A2" t="inlineStr"><is><t[^>]*>H001<\/t>/);
    expect(sheet).toMatch(/<c r="F2"><v>100<\/v><\/c>/);
  });

  test('the HR walkthrough finds its targets', async ({ page }) => {
    await page.goto(PORTAL + '&tour=hr');
    await expect(page.locator('.coach')).toContainText('在職狀態');
    await expect(page.locator('#roleSel')).toHaveValue('hr');
    for (let i = 0; i < 2; i++) {
      await expect(page.locator('.tour-hl')).toHaveCount(1);
      await page.click('[data-tourstep="1"]');
    }
    await expect(page.locator('#reportFmt.tour-hl')).toHaveCount(1);
  });
});

/* ================================================================ */
test.describe('Updates from the 7 Oct meeting', () => {
  test.beforeEach(async ({ page }) => { await openPortal(page); });

  test('the minutes page holds the official minutes of the third meeting', async ({ page }) => {
    await go(page, 'doc', 'meeting');
    const v = page.locator('#view');
    await expect(v).toContainText('入口網站建置第三次需求討論會議');
    await expect(v).toContainText('10/7（三）10:00–11:40');
    await expect(v).toContainText('4 人（姓名略）');
    await expect(v).toContainText('該連結正式命名為「居服個案管理系統」');
    await expect(v).toContainText('可直接連接衛福部系統之重大優勢');
    await expect(v).toContainText('由仁寶系統下載 Excel 報表');
    await expect(v).toContainText('復職年資重算，員編重編之原則');
    await expect(v).toContainText('只差雲端儲存空間');
    await expect(v).toContainText('新增「自訂流程」功能');
    await expect(v).toContainText('確認職稱即可執行項目名稱');
    await expect(v).toContainText('10/14（三）10:00');
    await expect(v).toContainText('入口網站建置第一次需求討論會議');      // the first meeting is kept
    await expect(v).toContainText('9/30 會議');                          // so is the second
    await expect(v).not.toContainText('人保');
    // the attendees' names are not on the site
    for (const n of ['吳培滋', '黃千育', '莊啟聖', '劉思慧']) await expect(v).not.toContainText(n);
    const todo = await page.locator('#view table', { hasText: '負責單位／人員' }).locator('tbody tr').count();
    expect(todo).toBe(5);
    expect(await page.evaluate(() => ANNOUNCEMENTS.some(a => a.id === 'A11'))).toBe(true);
    expect(await page.evaluate(() => EVENTS.filter(e => e.d === '2026-10-14').length)).toBe(1);
  });

  test('the recording summary is kept apart, with confirmed and pending wording', async ({ page }) => {
    await go(page, 'doc', 'meeting');
    const v = page.locator('#view');
    await expect(v).toContainText('同一場會議的錄音摘要');
    await expect(v).toContainText('用字已確認');
    await expect(v).toContainText('正確寫法是「意見反映」');
    await expect(v).toContainText('「製造」是「建立」的意思');
    await expect(v.locator('.note.q')).toHaveCount(0);                // nothing left to confirm
  });

  test('decisions and follow-ups carry the 7 Oct items', async ({ page }) => {
    await go(page, 'arch', 'scope');
    const rows = page.locator('#view tbody tr').filter({ has: page.locator('td.mono', { hasText: /^10\/7$/ }) });
    expect(await rows.count()).toBeGreaterThanOrEqual(20);          // 15 decisions + 8 follow-ups
    const v = page.locator('#view');
    await expect(v).toContainText('居服個案管理系統');
    await expect(v).toContainText('確認職稱即可執行項目名稱');
    await expect(v).toContainText('已併入 10/7 待辦 2');
    await expect(v).not.toContainText('人保');
  });

  test('wording is cohesive: the same terms everywhere', async ({ page }) => {
    // 需求端 (not 客戶), 暫定 (not placeholder in Chinese text), 居服個案管理系統 for the link, 仁寶 for the system
    for (const role of ['admin', 'hr', 'manager', 'employee']) {
      await setRole(page, role);
      const mods = await page.locator('[data-mod]').evaluateAll(n => n.map(x => x.dataset.mod));
      for (const m of mods) {
        await page.click(`[data-mod="${m}"]`);
        const tabs = await page.locator('[data-tab]').evaluateAll(n => n.map(x => x.dataset.tab));
        for (const tab of tabs.length ? tabs : [null]) {
          if (tab) await page.click(`[data-tab="${tab}"]`);
          const text = await page.locator('#app').innerText();
          for (const w of ['客戶', '最新會議', '最新一次', '一體式系統', 'Case-management']) {
            if (w === '一體式系統' && m === 'doc' && tab === 'meeting') continue;    // quoted as the recording's wording
            expect(text, `${role} ${m}:${tab} shows ${w}`).not.toContain(w);
          }
          expect(text, `${role} ${m}:${tab} has Chinese text with “placeholder”`).not.toMatch(/[\u4e00-\u9fff][^\n]{0,12}placeholder|placeholder[^\n]{0,12}[\u4e00-\u9fff]/);
        }
      }
    }
  });

  test('the link to 仁寶 is named 居服個案管理系統; data comes in by Excel later', async ({ page }) => {
    await go(page, 'svc', 'case');
    const v = page.locator('#view');
    await expect(page.locator('[data-tab="case"]')).toContainText('居服個案管理系統');
    await expect(v).toContainText('正式名稱是「居服個案管理系統」');
    await expect(v).toContainText('仁寶可以直接連接衛福部系統');
    await expect(v).toContainText('網址待 IT 提供');
    await expect(v).toContainText('在仁寶下載 Excel 報表');
    await expect(v).toContainText('Portal 彙總分析');
    await expect(v).toContainText('10/7 待辦 5');
    await expect(v).not.toContainText('暫緩');
    await setRole(page, 'admin');
    await go(page, 'set');
    await expect(page.locator('#view')).toContainText('居服個案管理系統（仁寶）');
    await expect(page.locator('#view')).toContainText('仁寶可直接連接衛福部系統');
  });

  test('title matrix: pre-filled from today’s roles, editable by the admin, Excel worksheet', async ({ page }) => {
    await go(page, 'arch', 'roles');
    await expect(page.locator('#view')).toContainText('職稱對照');
    await go(page, 'perm', 'titles');
    const tm = page.locator('#view table.titlematrix');
    await expect(tm.locator('thead th')).toHaveCount(17);            // item column + 14 titles + 2 sub-categories
    expect(await tm.locator('tbody tr').count()).toBeGreaterThan(30);
    // 照服員 (the employee persona) cannot open the HR module; 人資 can; other titles are blank
    const row = name => tm.locator('tbody tr', { hasText: name }).first();
    const col = t => Object.keys({}).length;                         // (placeholder to keep the helper local)
    const cellOf = async (rowName, title) => {
      const idx = await tm.locator('thead th').evaluateAll((ths, t) => ths.findIndex(h => h.textContent.includes(t)), title);
      return row(rowName).locator('td').nth(idx);
    };
    await expect(await cellOf('人事系統 › 員工資料', '人資')).toContainText('可');
    await expect(await cellOf('人事系統 › 員工資料', '照服員')).toContainText('不可');
    await expect(await cellOf('私人秘書 › 首頁', '照服員')).toContainText('可');
    await expect(await cellOf('人事系統 › 員工資料', '會計')).toContainText('—');
    // the admin cycles a blank cell: blank → 可 → 不可 → blank
    const cell = await cellOf('人事系統 › 員工資料', '會計');
    await cell.locator('button').click();
    await expect(await cellOf('人事系統 › 員工資料', '會計')).toContainText('可');
    await (await cellOf('人事系統 › 員工資料', '會計')).locator('button').click();
    await expect(await cellOf('人事系統 › 員工資料', '會計')).toContainText('不可');
    // the Excel worksheet
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-titlexlsx]')]);
    expect(dl.suggestedFilename()).toBe('職稱權限對照表_範本.xlsx');
    const buf = fs.readFileSync(await dl.path());
    expect(buf.subarray(0, 2).toString()).toBe('PK');
    const text = buf.toString('utf8');
    for (const t of ['職稱權限對照表（範本）', '項目名稱', '居家服務督導', '日照主管', '人事系統 › 員工資料', '私人秘書 › 首頁', '一般員工：司機', '一般員工：約聘人員（contractor）']) expect(text).toContain(t);
  });

  test('the admin creates a sub-category under a role category and it becomes a column', async ({ page }) => {
    await go(page, 'perm', 'titles');
    const heads = page.locator('table.titlematrix thead th');
    await expect(heads).toHaveCount(17);
    await page.selectOption('#subAddForm select[name="parent"]', 'hr');
    await page.fill('#subAddForm input[name="name"]', '實習生');
    await page.click('#subAddForm button[type="submit"]');
    await expect(heads).toHaveCount(18);
    await expect(heads.last()).toContainText('人資：實習生');
    // its cells start blank and the admin can set them
    const idx = 17;
    const cell = page.locator('table.titlematrix tbody tr', { hasText: '人事系統 › 員工資料' }).first().locator('td').nth(idx);
    await expect(cell).toContainText('—');
    await cell.locator('button').click();
    await expect(page.locator('table.titlematrix tbody tr', { hasText: '人事系統 › 員工資料' }).first().locator('td').nth(idx)).toContainText('可');
    // it can be removed again
    await heads.last().locator('[data-subdel]').click();
    await expect(heads).toHaveCount(17);
  });

  test('the title matrix and sub-categories are read-only for HR', async ({ page }) => {
    await setRole(page, 'hr');
    await go(page, 'perm', 'titles');
    await expect(page.locator('[data-tcell]')).toHaveCount(0);
    await expect(page.locator('[data-titlexlsx]')).toBeVisible();
    await expect(page.locator('#view')).toContainText('只有系統管理員可以修改');
    await setRole(page, 'admin');
    await go(page, 'perm', 'matrix');
    await expect(page.locator('[data-subdel]')).toHaveCount(0);
    await expect(page.locator('#subAddForm')).toHaveCount(0);
  });

  test('approval path follows the org chart and can be turned into a custom flow', async ({ page }) => {
    await setRole(page, 'hr');
    await go(page, 'fin', 'proc');
    await page.selectOption('#pathEmp', 'A004');
    const chain = page.locator('#pathChain');
    await expect(chain).toContainText('第 1 層');
    await expect(chain).toContainText('日照主管');
    await expect(chain).toContainText('第 2 層');
    await expect(chain).toContainText('管理者');
    await expect(chain).toContainText('第 3 層');
    await expect(chain).toContainText('老闆');
    await expect(page.locator('#view')).toContainText('金額大小可影響');
    // custom flow: remove the top level, add a different approver, then go back to the org chart
    await page.check('#pathCustom');
    await expect(page.locator('[data-pathdel]')).toHaveCount(3);
    await page.locator('[data-pathdel]').last().click();
    await expect(page.locator('#pathChain')).not.toContainText('第 3 層');
    await page.selectOption('#pathAdd', 'H004');
    await page.click('[data-pathadd]');
    await expect(page.locator('#pathChain')).toContainText('第 3 層');
    await expect(page.locator('#pathChain')).toContainText('會計');
    await page.click('[data-pathreset]');
    await expect(page.locator('#pathChain')).toContainText('老闆');
    await expect(page.locator('#pathCustom')).not.toBeChecked();
    await page.selectOption('#pathEmp', 'H001');
    await expect(page.locator('#pathChain')).toContainText('最上層');
  });

  test('only roles that approve can change a flow', async ({ page }) => {
    await go(page, 'fin', 'proc');                       // system admin: cannot approve
    await expect(page.locator('#pathCustom')).toBeDisabled();
    await expect(page.locator('#view')).toContainText('只有能簽核的身分');
  });

  test('rejoining after leaving restarts tenure from the rejoin date', async ({ page }) => {
    await setRole(page, 'hr');
    await go(page, 'hr', 'emp');
    await page.click('tr[data-emp="C003"]');            // 離職 since 2026-09-15, hired 2024-02-01
    await expect(drawer(page)).toContainText('2 年 7 個月');
    await page.click('aside.drawer details.addbox summary >> nth=0');
    const form = page.locator('aside.drawer form[data-add="status"]');
    await form.locator('select[name="status"]').selectOption('active');
    await form.locator('input[name="date"]').fill('2026-10-01');
    await form.locator('button[type="submit"]').click();
    await expect(drawer(page)).toContainText('離職後復職，年資從復職日 2026-10-01 重算');
    await expect(drawer(page)).toContainText('0 年 0 個月');
    await expect(drawer(page)).toContainText('在職');
  });

  test('add employee fills in the number automatically, per company', async ({ page }) => {
    await setRole(page, 'hr');
    await go(page, 'hr', 'emp');
    await page.click('[data-newemp]');
    await expect(drawer(page)).toBeVisible();
    await expect(page.locator('#neNo')).toHaveAttribute('readonly', '');
    await expect(page.locator('#neNo')).toHaveValue('A011');        // opens on 誠馨, which has A001–A010
    await page.selectOption('#neUnit', 'O2');
    await expect(page.locator('#neNo')).toHaveValue('B010');        // 誠芯 has B001–B009
    await page.selectOption('#neUnit', 'O3');
    await expect(page.locator('#neNo')).toHaveValue('C004');
    await page.selectOption('#neUnit', 'HQ');
    await expect(page.locator('#neNo')).toHaveValue('H007');
    await page.selectOption('#neUnit', 'O1');
    await expect(page.locator('#neNo')).toHaveValue('A011');
    await page.fill('#newEmpForm input[name="name"]', '示範新人');
    await page.click('#newEmpForm button[type="submit"]');
    await expect(drawer(page)).toContainText('示範新人');
    await expect(drawer(page)).toContainText('A011');
    await page.click('aside.drawer button.x');
    await expect(empRows(page)).toHaveCount(29);
    await expect(page.locator('tr[data-emp="A011"]')).toHaveCount(1);
    // the next one gets the next number
    await page.click('[data-newemp]');
    await expect(page.locator('#neNo')).toHaveValue('A012');
  });

  test('a new employee works in payroll, attendance and reports', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await setRole(page, 'hr');
    await go(page, 'hr', 'emp');
    await page.click('[data-newemp]');
    await page.selectOption('#neUnit', 'O2');
    await page.fill('#newEmpForm input[name="name"]', '示範新人');
    await page.click('#newEmpForm button[type="submit"]');
    await page.click('aside.drawer button.x');
    await go(page, 'pay', 'run');
    await expect(page.locator('tr[data-payemp="B010"]')).toHaveCount(1);
    await go(page, 'hr', 'att');
    await go(page, 'rpt');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-export="personnel"]')]);
    expect(fs.readFileSync(await dl.path(), 'utf8')).toContain('B010,示範新人');
    expect(errors).toEqual([]);
  });

  test('the employee-number rule is editable in settings and drives the next number', async ({ page }) => {
    await go(page, 'set');
    await expect(page.locator('#view')).toContainText('員工編號規則');
    const next = id => page.locator('#view tbody tr', { has: page.locator(`[data-numprefix="${id}"]`) }).locator('td.mono').last();
    await expect(next('O1')).toHaveText('A011');
    await page.fill('[data-numprefix="O1"]', 'q');
    await page.locator('[data-numprefix="O1"]').blur();
    await expect(next('O1')).toHaveText('Q001');
    await page.click('[data-numreset]');
    await expect(next('O1')).toHaveText('A011');
  });

  test('system info says mobile clock-in works and only cloud storage is missing', async ({ page }) => {
    await go(page, 'doc', 'sysinfo');
    await expect(page.locator('#view')).toContainText('已可執行手機打卡');
    await expect(page.locator('#view')).toContainText('只差雲端儲存空間');
    await expect(page.locator('#view')).toContainText('API Token');
  });
});

/* ================================================================ */
test.describe('Cash pay for staff without a bank account', () => {
  test.beforeEach(async ({ page }) => { await openPortal(page); await setRole(page, 'hr'); });

  test('payroll run lists cash-paid staff with a receipt list to export', async ({ page }) => {
    await go(page, 'pay', 'run');
    await page.selectOption('#payMonth', '2026-08');
    await expect(page.locator('tr[data-payemp="A007"]')).toContainText('現金發放');
    await expect(page.locator('tr[data-payemp="A003"]')).toContainText('銀行轉帳');
    const nets = await page.evaluate(() => ['A007', 'B006'].map(id => calcPay(id, '2026-08').net));
    const total = 'NT$' + (nets[0] + nets[1]).toLocaleString('en-US');
    await expect(page.locator('.tile', { hasText: '現金發放' })).toContainText(total);
    const list = page.locator('#cashList');
    await expect(list.locator('tbody tr')).toHaveCount(3);          // 2 staff + total
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-cashcsv]')]);
    expect(dl.suggestedFilename()).toBe('現金發薪簽收清冊_2026-08.csv');
    const lines = fs.readFileSync(await dl.path(), 'utf8').replace(/^﻿/, '').trim().split('\n');
    expect(lines[0]).toContain('領款人簽名');
    expect(lines.length).toBe(4);
  });

  test('payroll CSV has a pay-method column and no overnight column', async ({ page }) => {
    await go(page, 'pay', 'run');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-paycsv]')]);
    const lines = fs.readFileSync(await dl.path(), 'utf8').replace(/^﻿/, '').trim().split('\n');
    const head = lines[0].split(','), i = head.indexOf('發薪方式');
    expect(i).toBeGreaterThan(-1);
    expect(head).not.toContain('大夜班次');
    expect(lines.find(l => l.startsWith('A007,')).split(',')[i]).toBe('現金發放');
  });

  test('HR can switch an employee to cash in the personnel file', async ({ page }) => {
    await go(page, 'hr', 'emp');
    await page.click('tr[data-emp="A004"]');
    await page.click('[data-sec="basic"]');
    await page.click('[data-edit="basic"]');
    await page.selectOption('form[data-save="basic"] select[name="payMethod"]', 'cash');
    await page.click('form[data-save="basic"] button[type="submit"]');
    await expect(page.locator('aside.drawer .drawer-b')).toContainText('現金發放');
    await page.click('aside.drawer button.x');
    await go(page, 'pay', 'run');
    await expect(page.locator('#cashList')).toContainText('A004');
  });

  test('the employee’s payslip says how they are paid', async ({ page }) => {
    await setRole(page, 'employee');
    await page.click('[data-tab="query"]');
    await page.click('[data-dq="slip"]');
    await expect(page.locator('#view')).toContainText('匯入薪資帳戶');
    await page.evaluate(() => { empRecord('A004').basic.payMethod = 'cash'; render(); });
    await expect(page.locator('#view')).toContainText('現金發放：發薪日至人資領取並簽收');
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
    await openRecord(page, 'hr', 'A003');
    await expect(page.locator('[data-sec]')).toHaveCount(6);
    for (const [sec, text] of Object.entries(SECS)) {
      await openSec(page, sec);
      await expect(body(page)).toContainText(text);
    }
    await page.click('aside.drawer button.x');
    await expect(drawer(page)).toHaveCount(0);
  });

  test('hr sees full ID, pay, bank account and insurance grades', async ({ page }) => {
    await openRecord(page, 'hr', 'A003');
    await expect(body(page)).toContainText('NT$58,000');
    const idNo = await page.evaluate(() => empRecord('A003').basic.idNo);
    await openSec(page, 'basic');
    await expect(body(page)).toContainText(idNo);
    await expect(body(page).locator('.lock')).toHaveCount(0);
    await openSec(page, 'hist');
    await expect(body(page)).toContainText('NT$');
    await openSec(page, 'ins');
    await expect(body(page)).toContainText('勞保投保薪資');
  });

  test('admin gets contact details but masked ID and locked pay', async ({ page }) => {
    await openRecord(page, 'admin', 'A003');
    await expect(body(page)).toContainText('僅人資可見');
    const { idNo, mobile } = await page.evaluate(() => empRecord('A003').basic);
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
    await openRecord(page, 'manager', 'A003');
    const { mobile } = await page.evaluate(() => empRecord('A003').basic);
    await openSec(page, 'basic');
    await expect(body(page)).not.toContainText(mobile);
    await expect(body(page).locator('.lock').first()).toContainText('受限');
    await expect(body(page)).toContainText('薪資帳戶僅人資可見');
  });

  test('manager opening an out-of-scope person gets no sections', async ({ page }) => {
    await openPortal(page);
    await setRole(page, 'manager');
    await go(page, 'ann', 'org');
    await page.click('[data-node="B001"]');              // 誠芯 day care supervisor (out of scope)
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
    leave: ['差勤申請報表', '單號,類型,員工編號'],
    financial: ['財務報表', '員工編號,姓名,公司,部門,計薪方式,應發金額']
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
    expect(ids).toHaveLength(10);
    expect(ids.every(id => id.startsWith('A'))).toBe(true);
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
