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
  await expect(page.locator('.brand')).toBeVisible();   // 手機上篩選列收起，所以不等身分下拉
}
async function setRole(page, role) {
  await page.selectOption('#roleSel', role);
  await expect(page.locator('#roleSel')).toHaveValue(role);
}
async function go(page, mod, tab) {
  await page.click(`[data-mod="${mod}"]`);
  if (tab) {
    /* 「更多頁面」預設收起；要去的分頁不在畫面上時先展開 */
    if (!(await page.locator(`[data-tab="${tab}"]`).count()) && (await page.locator('#moreToggle').count())) await page.click('#moreToggle');
    await page.click(`[data-tab="${tab}"]`);
  }
}
const empRows = page => page.locator('#view tbody tr[data-emp]');
const editPerms = async page => { await page.click('[data-perm-edit]'); };   // 權限對照表平常唯讀，按右上角「編輯」才能改
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
    expect(values).toEqual(['admin', 'hr', 'manager', 'employee', 'boss', 'training', 'accountant', 'daydir', 'daysw',
      'homelead', 'homesup', 'cmlead', 'cm', 'driver', 'hca']);   // 4 original + 11 from the title matrix columns
  });

  test('switching role updates the persona chip', async ({ page }) => {
    const chip = page.locator('.pagehead .chip.acc');
    await setRole(page, 'hr');
    await expect(chip).toContainText('人資');
    await setRole(page, 'manager');
    await expect(chip).toContainText('管理者');
    await setRole(page, 'daydir');
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

  test('HR module exposes its tabs and opens on the to-do page', async ({ page }) => {
    await go(page, 'hr');
    for (const t of ['todo', 'emp', 'mylog', 'att', 'leave']) {
      await expect(page.locator(`[data-tab="${t}"]`)).toBeVisible();
    }
    await expect(page.locator('[data-tab="todo"]')).toHaveAttribute('aria-selected', 'true');
  });
});

/* ================================================================ */
test.describe('Data scope', () => {
  test.beforeEach(async ({ page }) => { await openPortal(page); });

  test('admin and hr see all 30 employees', async ({ page }) => {
    await go(page, 'hr', 'emp');
    await expect(empRows(page)).toHaveCount(30);
    await setRole(page, 'hr');
    await expect(empRows(page)).toHaveCount(30);
  });

  test('manager sees only O1 staff and the office filter is locked', async ({ page }) => {
    await setRole(page, 'daydir');
    await go(page, 'hr', 'emp');
    await expect(empRows(page)).toHaveCount(10);   // 誠馨: day care, home care and community center staff
    const ids = await empRows(page).evaluateAll(rs => rs.map(r => r.dataset.emp));
    expect(ids.every(id => id.startsWith('A'))).toBe(true);
    await expect(page.locator('#view tbody')).not.toContainText('誠芯');
    await expect(page.locator('#offSel')).toBeDisabled();
    await expect(page.locator('#view .note.q')).toContainText('隱藏了 20 位');
  });

  test('assumption toggle opens the manager to every facility', async ({ page }) => {
    await setRole(page, 'manager');
    await go(page, 'hr', 'emp');
    await page.click('#assumeBtn');
    await expect(page.locator('#assumeBtn')).toHaveAttribute('aria-pressed', 'true');
    await expect(empRows(page)).toHaveCount(30);
    await expect(page.locator('#offSel')).toBeEnabled();
  });

  test('office filter narrows admin to one facility', async ({ page }) => {
    await go(page, 'hr', 'emp');
    await page.selectOption('#offSel', 'O2');
    await expect(empRows(page)).toHaveCount(9);
  });

  test('manager attendance and leave views are limited to O1', async ({ page }) => {
    await setRole(page, 'daydir');
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

  test('admin sees the full matrix, read-only until Edit is pressed (one merged tab)', async ({ page }) => {
    await go(page, 'perm', 'matrix');
    await expect(page.locator('[data-tab="titles"]')).toHaveCount(0);     // 10/20：「職稱對照」併入「權限對照表」
    await expect(page.locator('.permtable thead th')).toHaveCount(16);   // capability column + 15 roles
    await expect(page.locator('table.titlematrix thead th')).toHaveCount(16);
    await expect(page.locator('[data-perm]')).toHaveCount(0);            // 平常唯讀
    await expect(page.locator('[data-tcell]')).toHaveCount(0);
    await editPerms(page);
    await expect(page.locator('[data-perm]')).toHaveCount(180);          // 11 editable capabilities × 15 roles
    await expect(page.locator('[data-tcell]')).toHaveCount(465);         // 31 items × 15 columns
    await expect(page.locator('[data-perm="admin|perms"]')).toBeDisabled();
    await expect(page.locator('[data-perm="admin|mgmt"]')).toBeDisabled();
    await expect(page.locator('[data-perm="employee|mgmt"]')).toHaveAttribute('aria-pressed', 'false');
  });

  test('manager can edit the permission matrix too (20 Oct: manager and system administrator)', async ({ page }) => {
    await setRole(page, 'manager');
    await go(page, 'perm', 'matrix');
    await expect(page.locator('.permtable thead th')).toHaveCount(16);
    await expect(page.locator('[data-perm]')).toHaveCount(0);
    await editPerms(page);
    await expect(page.locator('[data-perm]')).toHaveCount(180);
    await page.click('[data-perm-cancel]');
    await expect(page.locator('[data-perm]')).toHaveCount(0);
  });
  for (const r of ['hr']) {
    test(`${r} sees only their own column, read-only, and still gets open questions`, async ({ page }) => {
      await setRole(page, r);
      await go(page, 'perm', 'matrix');
      await expect(page.locator('.permtable thead th')).toHaveCount(2);
      await expect(page.locator('[data-perm]')).toHaveCount(0);
      await expect(page.locator('[data-perm-edit]')).toHaveCount(0);
      await expect(page.locator('#view')).toContainText('只有管理者與系統管理員可以編輯');
      await expect(page.locator('[data-tab="open"]')).toHaveCount(0);   // 預設收在「更多頁面」
      await page.click('#moreToggle');
      await expect(page.locator('[data-tab="open"]')).toBeVisible();
    });
  }

  test('a change made by admin takes effect for that role and can be restored', async ({ page }) => {
    await go(page, 'perm', 'matrix');
    await editPerms(page);
    await page.click('[data-perm="manager|salary"]');                  // 管理者預設可看薪資（10/20）；關掉看看
    await page.click('[data-perm-save]');
    await expect(page.locator('#view')).toContainText('權限異動紀錄');

    await setRole(page, 'manager');
    await go(page, 'hr', 'emp');
    await expect(page.locator('#view tbody')).not.toContainText('NT$');

    await setRole(page, 'admin');
    await go(page, 'perm', 'matrix');
    await page.click('[data-permreset]');
    await expect(page.locator('[data-perm="manager|salary"]')).toHaveCount(0);
    await setRole(page, 'manager');
    await go(page, 'hr', 'emp');
    await expect(empRows(page).first()).toContainText('NT$');
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
    expect(mods).toEqual(['desk', 'ann', 'perm', 'fin']);   // 職稱對照 Excel：照服員 開放私人秘書、公告欄、內部通訊錄（在權限與範圍）、線上申請
    await expect(page.locator('#assumeBtn')).toHaveCount(0);
    await expect(page.locator('.pagehead .chip.acc')).toContainText('照服員');
  });

  test('page access follows the title matrix Excel and updates when the admin edits a cell', async ({ page }) => {
    const mods = async () => page.locator('[data-mod]').evaluateAll(n => n.map(x => x.dataset.mod));
    // admin (系統管理員): everything, payroll is view-only (confirmed 21 Oct)
    expect(await mods()).toEqual(['arch', 'desk', 'ann', 'hr', 'perm', 'doc', 'fin', 'svc', 'pay', 'rpt', 'set']);
    // HR (人資主管): no case-system pages, no system settings, payroll yes
    await setRole(page, 'hr');
    await expect(page.locator('[data-mod="pay"]')).toBeVisible();
    await expect(page.locator('[data-mod="set"]')).toHaveCount(0);
    await go(page, 'svc');
    await expect(page.locator('[data-tab="case"]')).toHaveCount(0);
    await page.click('#moreToggle');
    await expect(page.locator('[data-tab="assess"]')).toBeVisible();
    // manager (管理者): payroll is view-only in the Excel, so the module is there; no system settings
    await setRole(page, 'manager');
    await expect(page.locator('[data-mod="pay"]')).toBeVisible();
    await expect(page.locator('[data-mod="set"]')).toHaveCount(0);
    // the admin switches a cell off and the employee loses that tab
    await setRole(page, 'admin');
    await go(page, 'perm', 'matrix');
    const tm = page.locator('table.titlematrix');
    const idx = await tm.locator('thead th').evaluateAll(ths => ths.findIndex(h => h.textContent.includes('一般員工：照服員')));
    const row = tm.locator('tbody tr', { hasText: '私人秘書 › 課程' }).first();
    await editPerms(page);
    await row.locator('td').nth(idx).locator('button').click();     // 可 → 不可
    await page.click('[data-perm-save]');
    await setRole(page, 'employee');
    await expect(page.locator('[data-tab="course"]')).toHaveCount(0);
    await expect(page.locator('[data-tab="home"]')).toBeVisible();
    // the admin cannot lock themselves out of the matrix
    await setRole(page, 'admin');
    await go(page, 'perm', 'matrix');
    const adminIdx = await tm.locator('thead th').evaluateAll(ths => ths.findIndex(h => h.textContent.includes('系統管理員')));
    await editPerms(page);
    await tm.locator('tbody tr', { hasText: '權限與範圍 › 權限對照表' }).first().locator('td').nth(adminIdx).locator('button').click();
    await expect(page.locator('[data-mod="perm"]')).toBeVisible();
  });

  test('every title column in the matrix has a role to switch to, and its pages follow the Excel', async ({ page }) => {
    const expected = await page.evaluate(() => Object.keys(ROLE_COL).map(r => {
      const col = ROLE_COL[r];
      const mods = MODULES.filter(m => m.tabs.length ? m.tabs.filter(t => !t.virtual).some(t => ['可', '可檢視', '可編輯'].includes(titleCell(permItems().find(i => i.key === m.id + ':' + t.id), col)))
        : ['可', '可檢視', '可編輯'].includes(titleCell(permItems().find(i => i.key === m.id), col))).map(m => m.id);
      return { r, mods };
    }));
    expect(expected).toHaveLength(15);
    for (const { r, mods } of expected) {
      await setRole(page, r);
      const shown = await page.locator('[data-mod]').evaluateAll(n => n.map(x => x.dataset.mod));
      const want = r === 'admin' ? [...new Set([...mods, 'perm'])] : mods;
      expect(shown.sort(), r).toEqual(want.sort());
    }
    // the Excel columns without a role before this change
    await setRole(page, 'boss');
    await expect(page.locator('.pagehead .chip.acc')).toContainText('老闆');
    await expect(page.locator('[data-mod="set"]')).toHaveCount(0);        // 系統設定：老闆不可
    await expect(page.locator('[data-mod="pay"]')).toBeVisible();          // 薪資計算：可檢視
    await go(page, 'pay', 'ver');
    await expect(page.locator('#view')).toContainText('只有「可檢視」');
    await expect(page.locator('[data-savever]')).toHaveCount(0);           // not on this tab; the run tab holds the button
    await page.click('[data-tab="run"]');
    await expect(page.locator('[data-savever]')).toBeDisabled();
    await setRole(page, 'hr');
    await go(page, 'pay', 'run');
    await expect(page.locator('[data-savever]')).toBeEnabled();
    // borrowed demo persons show the role's own title
    await setRole(page, 'homelead');
    await expect(page.locator('.pagehead .chip.acc')).toContainText('居服主管');
    await setRole(page, 'cmlead');
    await expect(page.locator('.pagehead .chip.acc')).toContainText('A個管主管');
    // sub-category employees land on 私人秘書 and see only their own data
    await setRole(page, 'driver');
    await expect(page.locator('[data-mod="desk"]')).toHaveAttribute('aria-current', 'true');
    await expect(page.locator('#assumeBtn')).toHaveCount(0);
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
    await setRole(page, 'daydir');
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
    await setRole(page, 'daydir');
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

  for (const role of ['admin', 'daydir']) {
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
    await expect(calc).toContainText('2 小時');             // default 17:00–19:00

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
    await expect(rows).toHaveCount(19);                  // 27 Oct: 104 leave list (the 2 designated-staff types are hidden)

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
    await go(page, 'set');                                                          // 展示日期不再放在左下角，改看系統設定的「示範資料的今天」
    await expect(page.locator('#view')).toContainText('2026-10-07');
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
    await setRole(page, 'daydir');
    await expect(page.locator('.pagehead .chip.warn')).toContainText('誠馨');
    await setRole(page, 'manager');
    await expect(page.locator('.pagehead .chip.warn')).toContainText('全部公司');   // the manager works across units
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
          const text = (await page.locator('#app').innerText()).replace(/原住民/g, '');   // 「原住民族文化」是繼續教育積分的正式類別名稱
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
    await setRole(page, 'daydir');
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

  test('the user guide has the pre-MVP checklist and the follow-up message', async ({ page }) => {
    await page.goto('file://' + path.resolve(__dirname, '../guide.html'));
    const sec = page.locator('#confirm');
    await expect(sec.locator('h2')).toContainText('MVP 定案前待同事補齊');
    await expect(sec.locator('tbody tr')).toHaveCount(6);
    await expect(sec).toContainText('繼續教育積分（私人秘書 › 課程）：確認積分規則');
    await expect(sec).toContainText('組織圖 10/13 版與 10/20 的 V3');
    const upd = page.locator('#new1014');
    await expect(upd).toContainText('日照主管的人事頁面已開放');
    await expect(upd).toContainText('主管可跨單位查看');
    await expect(upd).toContainText('第四次會議正式紀錄（V2.0）已放進');
    await expect(page.locator('.toc a[href="#new1014"]')).toBeVisible();
    await expect(page.locator('#basics')).toContainText('日照主管');
    await expect(sec).toContainText('可以直接傳給同事的訊息');
    await expect(sec).toContainText('最影響進度的三件事');
    await expect(sec.locator('.note.warn li')).toHaveCount(3);
    await expect(page.locator('#ce')).toContainText('匯入範本怎麼用');
    await expect(page.locator('#ce')).toContainText('一列一門課');
    await expect(sec).toContainText('下次會議（10/21 週三 10:00）前想請你幫忙');
    const msg = (await sec.locator('.note').last().innerText()).length;
    expect(msg).toBeLessThan(400);                                   // the message stays short
    await expect(page.locator('.toc a[href="#confirm"]')).toBeVisible();
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
    const todo = await page.locator('section.card', { has: page.locator('h2', { hasText: '後續待辦事項（10/7 會議）' }) }).locator('tbody tr').count();
    expect(todo).toBe(5);
    expect(await page.evaluate(() => ANNOUNCEMENTS.some(a => a.id === 'A11'))).toBe(true);
    expect(await page.evaluate(() => EVENTS.filter(e => e.d === '2026-10-14').length)).toBe(1);
  });

  test('the minutes page holds the official minutes of the fourth meeting, with decisions and follow-ups', async ({ page }) => {
    await go(page, 'doc', 'meeting');
    const v = page.locator('#view');
    for (const x of ['入口網站建置第四次需求討論會議', '10/14（三）11:00–12:00', '雲端儲存容量規劃', '無須於初期一次購足所有容量', '正式版：提供管理及行政作業使用',
      '簡易版：提供一般員工查閱', '新增附件上傳機制', '日期區間的彈性選擇機制', '衛福部積分系統與入口網站串接', '內部通訊錄資料維護', '中文輸入法相容性確認',
      '仁寶 Excel 資料上傳入口網站之可行性', '新增 Q&A 互動功能', '10/21（三）10:00；地點待確認', '評估雲端儲存容量及加購方案', '確認並更新內部通訊錄資料']) await expect(v).toContainText(x);
    await expect(v).not.toContainText('人保');
    for (const n of ['吳培滋', '黃千育', '莊啟聖', '劉思慧', 'Mindy']) await expect(v).not.toContainText(n);
    const todo = await page.locator('section.card', { has: page.locator('h2', { hasText: '後續待辦事項（10/14 會議）' }) }).locator('tbody tr').count();
    expect(todo).toBe(6);
    // the 14 Oct decisions are tracked on the prototype page, and the follow-ups carry the new items
    const info = await page.evaluate(() => ({ dec: MEETING_DECISIONS.filter(d => d.src === '10/14').length, fu: FOLLOW_UPS.filter(f => /積分系統|內部通訊錄/.test(f.zh) && f.src === '10/14').length,
      ev: EVENTS.filter(e => e.d === '2026-10-21').length }));
    expect(info.dec).toBe(9);
    expect(info.fu).toBe(3);               // the two minutes items plus the 10/14 note about the directory
    expect(info.ev).toBe(1);
    await go(page, 'arch', 'scope');
    await expect(page.locator('#view')).toContainText('衛福部積分系統');
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
    await expect(v).toContainText('匯入仁寶服務記錄');
    await expect(v).not.toContainText('暫緩');
    await setRole(page, 'admin');
    await go(page, 'set');
    await expect(page.locator('#view')).toContainText('居服個案管理系統（仁寶）');
    await expect(page.locator('#view')).toContainText('仁寶可直接連接衛福部系統');
  });

  test('title matrix: loaded from the requester Excel, editable by the admin, Excel worksheet', async ({ page }) => {
    await go(page, 'arch', 'roles');
    await expect(page.locator('#view')).toContainText('職稱對照');
    await go(page, 'perm', 'matrix');
    const tm = page.locator('#view table.titlematrix');
    await expect(tm.locator('thead th')).toHaveCount(16);            // item column + 12 titles + 3 sub-categories
    await expect(page.locator('#view')).toContainText('已填 465 / 465');
    const row = name => tm.locator('tbody tr', { hasText: name }).first();
    const cellOf = async (rowName, title) => {
      const idx = await tm.locator('thead th').evaluateAll((ths, t) => ths.findIndex(h => h.textContent.includes(t)), title);
      return row(rowName).locator('td').nth(idx);
    };
    await expect(await cellOf('人事系統 › 員工資料', '人資主管')).toContainText('可');
    await expect(await cellOf('人事系統 › 員工資料', '會計')).toContainText('不可');
    await expect(await cellOf('私人秘書 › 首頁', '一般員工：司機')).toContainText('可');
    await expect(await cellOf('薪資計算 › 薪資試算', '人資主管')).toContainText('可編輯');
    await expect(await cellOf('薪資計算 › 薪資試算', '老闆')).toContainText('可檢視');
    await expect(await cellOf('系統設定', '系統管理員')).toContainText('可');
    await expect(await cellOf('人事系統 › 員工資料', '系統管理員')).toContainText('可檢視');   // 10/20：系統管理員可檢視所有內容，不可修改
    await expect(await cellOf('人事系統 › 員工資料', '管理者')).toContainText('可編輯');       // 管理者幾乎全部可修改
    await expect(await cellOf('公告欄 › 公告', '人資主管')).toContainText('可編輯');          // 人資：人事系統與公告欄可修改
    await expect(await cellOf('薪資計算 › 薪資試算', '管理者')).toContainText('可檢視');       // 管理者的薪資計算只能檢視
    // the admin presses Edit, then cycles a cell: 不可 → blank → 可 → 不可
    await editPerms(page);
    const cell = await cellOf('人事系統 › 員工資料', '會計');
    await cell.locator('button').click();
    await expect(await cellOf('人事系統 › 員工資料', '會計')).toContainText('—');
    await (await cellOf('人事系統 › 員工資料', '會計')).locator('button').click();
    await expect(await cellOf('人事系統 › 員工資料', '會計')).toContainText('可');
    // differences from the prototype's four roles are listed
    await expect(page.locator('#view')).toContainText('與目前原型權限的差異');
    // the Excel worksheet
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-titlexlsx]')]);
    expect(dl.suggestedFilename()).toBe('職稱權限對照表.xlsx');
    const buf = fs.readFileSync(await dl.path());
    expect(buf.subarray(0, 2).toString()).toBe('PK');
    const text = buf.toString('utf8');
    for (const t of ['職稱權限對照表（需求端提供）', '項目名稱', '居家服務督導', 'A個管主管', '日照社工/護理師', '人事系統 › 員工資料', '私人秘書 › 首頁', '一般員工：司機', '一般員工：居服員']) expect(text).toContain(t);
  });

  test('org chart tab shows the 13 Oct organisation structure: 4 entities, facilities, units and titles', async ({ page }) => {
    await go(page, 'ann', 'org');
    const v = page.locator('#view');
    await expect(v).toContainText('組織架構（需求端 10/13 提供）');
    for (const s of ['社團法人中華民國誠馨照顧協會', '誠馨健康股份有限公司', '誠芯樂活事業股份有限公司', '牛津樂活事業股份有限公司',
      '附設私立誠馨二館社區長照機構', '附設私立誠芯三館綜合長照機構', '社區整合型服務中心（北區Ａ單位）', '業務負責人（居服主管）', '業務負責人（日照主管）',
      'A個管', '日照社工', '居家服務督導', '照服員、司機', '跨單位主管', 'A個管主管', '政府的命名（Ａ單位個管師）',
      '動態調整', '簽核流程有部分與組織圖不一樣']) await expect(v).toContainText(s);
    await expect(page.locator('.orgf .orgbox.ent:not(.shared)')).toHaveCount(4);
    await expect(v).toContainText('正式全名版');
    await expect(page.locator('#view [data-node]')).toHaveCount(0);   // the clickable staff chart is the working view, in the other tab
    await go(page, 'perm', 'orgfn');
    await expect(page.locator('#view .orgcol')).toHaveCount(5);    // shared admin + 4 entities in the staff chart
    await expect(page.locator('#view')).toContainText('組織圖與通訊錄');
  });

  test('the admin creates a sub-category under a role category and it becomes a column', async ({ page }) => {
    await go(page, 'perm', 'matrix');
    await editPerms(page);
    const heads = page.locator('table.titlematrix thead th');
    await expect(heads).toHaveCount(16);
    await page.selectOption('#subAddForm select[name="parent"]', 'hr');
    await page.fill('#subAddForm input[name="name"]', '實習生');
    await page.click('#subAddForm button[type="submit"]');
    await expect(heads).toHaveCount(17);
    await expect(heads.last()).toContainText('人資：實習生');
    // its cells start blank and the admin can set them
    const idx = 16;
    const cell = page.locator('table.titlematrix tbody tr', { hasText: '人事系統 › 員工資料' }).first().locator('td').nth(idx);
    await expect(cell).toContainText('—');
    await cell.locator('button').click();
    await expect(page.locator('table.titlematrix tbody tr', { hasText: '人事系統 › 員工資料' }).first().locator('td').nth(idx)).toContainText('可');
    // it can be removed again
    await heads.last().locator('[data-subdel]').click();
    await expect(heads).toHaveCount(16);
  });

  test('the title matrix and sub-categories are read-only for HR', async ({ page }) => {
    await setRole(page, 'hr');
    await go(page, 'perm', 'matrix');
    await expect(page.locator('[data-tcell]')).toHaveCount(0);
    await expect(page.locator('[data-titlexlsx]')).toBeVisible();
    await expect(page.locator('[data-perm-edit]')).toHaveCount(0);
    await setRole(page, 'admin');
    await go(page, 'perm', 'matrix');
    await expect(page.locator('[data-subdel]')).toHaveCount(0);           // 沒按「編輯」就沒有刪除與建立
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

  test('rejoining after leaving is a new hire with a new number; the old number is not reused', async ({ page }) => {
    await setRole(page, 'hr');
    await go(page, 'hr', 'emp');
    await page.click('tr[data-emp="C003"]');            // 離職 since 2026-09-15, hired 2024-02-01
    await expect(drawer(page)).toContainText('2 年 7 個月');
    await page.click('aside.drawer details.addbox summary >> nth=0');
    const form = page.locator('aside.drawer form[data-add="status"]');
    await expect(form.locator('select[name="status"] option[value="active"]')).toHaveCount(0);   // cannot be set back to 在職
    await expect(drawer(page)).toContainText('回任要以新進人員重新建檔');
    await page.click('aside.drawer button.x');
    // the rejoin is entered as a new hire, with the old number noted for reference only
    await page.click('[data-newemp]');
    await page.selectOption('#neUnit', 'O3');
    await expect(page.locator('#neNo')).toHaveValue('C004');
    await page.fill('#newEmpForm input[name="name"]', '回任示範');
    await page.fill('#newEmpForm input[name="prevNo"]', 'C003');
    await page.click('#newEmpForm button[type="submit"]');
    await expect(drawer(page)).toContainText('C004');
    await expect(drawer(page)).toContainText('前員編 C003（不沿用）');
    await expect(drawer(page)).toContainText('0 年 0 個月');
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
    await page.selectOption('#neUnit', 'O4');
    await expect(page.locator('#neNo')).toHaveValue('D003');        // 誠馨健康 has D001–D002
    await page.selectOption('#neUnit', 'HQ');
    await expect(page.locator('#neNo')).toHaveValue('H007');
    await page.selectOption('#neUnit', 'O1');
    await expect(page.locator('#neNo')).toHaveValue('A011');
    await page.fill('#newEmpForm input[name="name"]', '示範新人');
    await page.click('#newEmpForm button[type="submit"]');
    await expect(drawer(page)).toContainText('示範新人');
    await expect(drawer(page)).toContainText('A011');
    await page.click('aside.drawer button.x');
    await expect(empRows(page)).toHaveCount(31);
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

  test('manager can see contact details and pay (20 Oct), but a day-care supervisor cannot', async ({ page }) => {
    await openRecord(page, 'manager', 'A003');
    const mob = await page.evaluate(() => empRecord('A003').basic.mobile);
    await openSec(page, 'basic');
    await expect(body(page)).toContainText(mob);
  });
  test('day-care supervisor cannot see contact details or pay', async ({ page }) => {
    await openRecord(page, 'daydir', 'A003');
    const { mobile } = await page.evaluate(() => empRecord('A003').basic);
    await openSec(page, 'basic');
    await expect(body(page)).not.toContainText(mobile);
    await expect(body(page).locator('.lock').first()).toContainText('受限');
    await expect(body(page)).toContainText('薪資帳戶僅人資可見');
  });

  test('manager opening an out-of-scope person gets no sections', async ({ page }) => {
    await openPortal(page);
    await setRole(page, 'daydir');
    await go(page, 'perm', 'orgfn');
    await page.click('[data-node="B001"]');              // 誠芯 day care supervisor (out of scope)
    await expect(page.locator('.contactcard')).toContainText('不在您目前的資料範圍內');   // 點人員先看聯絡卡；範圍外只看得到職位
    await expect(page.locator('.contactcard [data-contact-open]')).toHaveCount(0);
    await expect(page.locator('.contactcard a[href^="mailto:"]')).toHaveCount(0);
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

  for (const role of ['admin', 'daydir']) {
    test(`${role} cannot export the payroll (financial) report`, async ({ page }) => {
      await setRole(page, role);
      await go(page, 'rpt');
      await expect(page.locator('[data-export="financial"]')).toHaveCount(0);
      await expect(page.locator('#view')).toContainText('僅人資可匯出薪資資料');
      await expect(page.locator('[data-export="attendance"]')).toBeVisible();
    });
  }

  test('manager exports contain only O1 staff', async ({ page }) => {
    await setRole(page, 'daydir');
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

  test('org chart shows the real names for the owner, manager and system administrator', async ({ page }) => {
    await openPortal(page);
    await go(page, 'perm', 'orgfn');
    const view = page.locator('#view');
    await expect(view).toContainText('吳培滋 Steven Wu');
    await expect(view).toContainText('黃千育 Drew');
    await expect(view).toContainText('劉思慧');
    await expect(view).not.toContainText('徐宗翰');
  });

  test('the permission matrix tab shows the Excel format: items × all 15 roles', async ({ page }) => {
    await openPortal(page);
    await go(page, 'perm', 'matrix');
    const rm = page.locator('table.titlematrix');
    await expect(rm.locator('thead th')).toHaveCount(16);            // item column + 15 roles
    expect(await rm.locator('tbody tr').count()).toBe(31);           // 通訊錄併入組織圖、職稱對照併入權限對照表後的項目數
    const idx = await rm.locator('thead th').evaluateAll(ths => ths.findIndex(h => h.textContent.includes('老闆')));
    await expect(rm.locator('tbody tr', { hasText: '薪資計算 › 薪資試算' }).first().locator('td').nth(idx)).toContainText('可檢視');
    await expect(page.locator('.permtable thead th')).toHaveCount(16); // the finer table covers all 15 roles
    await setRole(page, 'hr');
    await expect(page.locator('.permtable thead th')).toHaveCount(2);   // others only see their own column in the finer table
  });

  test('finer permissions use the Excel Yes/No format for all 15 roles and download as Excel', async ({ page }) => {
    await openPortal(page);
    await go(page, 'perm', 'matrix');
    await editPerms(page);
    const cell = page.locator('[data-perm="daydir|approve"]');
    await expect(cell).toContainText('可');
    await expect(cell).toHaveAttribute('aria-pressed', 'true');
    await cell.click();
    await expect(page.locator('[data-perm="daydir|approve"]')).toContainText('不可');
    await expect(page.locator('#view')).toContainText('日照主管');
    await page.click('[data-permreset]');
    await expect(page.locator('[data-perm="daydir|approve"]')).toContainText('可');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-capxlsx]')]);
    expect(dl.suggestedFilename()).toBe('細項權限對照表.xlsx');
    const text = fs.readFileSync(await dl.path()).toString('utf8');
    for (const s of ['細項權限對照表', '簽核部屬請假', '一般員工：司機', '老闆']) expect(text).toContain(s);
  });

  test('104 export fields are listed without personal data, and the approval path notes the org-chart difference', async ({ page }) => {
    await openPortal(page);
    await go(page, 'doc', 'cmp104');
    const v = page.locator('#view');
    await expect(v).toContainText('104 員工資料匯出欄位');
    for (const f of ['公司統編', '員工編號', '身分證字號', '復職日期', '工作技能（104 上選填）', '職能（104 上選填）']) await expect(v).toContainText(f);
    await expect(v).toContainText('CSCT');
    await expect(v).not.toContainText('@gmail.com');
    await go(page, 'fin', 'proc');
    await expect(page.locator('#view')).toContainText('部分與組織圖不一樣');
  });

  test('the cloud storage estimator computes from the assumptions and has presets', async ({ page }) => {
    await openPortal(page);
    await go(page, 'doc', 'sysinfo');
    const v = page.locator('#view');
    await expect(v).toContainText('雲端儲存空間估算');
    await expect(v).toContainText('不是會議決定');
    // 300 × 22 × 2 × 12 = 158,400 records a year; 1 KB each; 5 years ≈ 773 MB; + 1.8 GB attachments; × 3 copies = 7.5 GB
    await expect(page.locator('#stOut')).toContainText('158,400');
    const text = async () => (await page.locator('#stTotal').textContent()).trim();
    expect(await text()).toBe('7.5 GB');
    await page.click('[data-stpreset="p300"]');                 // every punch stores a photo
    expect(await text()).toBe('687.3 GB');
    await page.click('[data-stpreset="s2000"]');
    expect(await text()).toBe('50.3 GB');
    await page.fill('#stForm input[name="years"]', '1');
    await expect(page.locator('#stOut')).toContainText('保存 1 年');
  });

  test('the case-system page offers the 仁寶 import and lists what is still to confirm', async ({ page }) => {
    await openPortal(page);
    await go(page, 'svc', 'case');
    const v = page.locator('#view');
    for (const s of ['匯入仁寶服務記錄', '只在你的瀏覽器裡讀取', '忘簽退', '10/20 會議已決定']) await expect(v).toContainText(s);
  });

  test('the user guide explains how to estimate cloud storage, with numbers that match the estimator', async ({ page }) => {
    await page.goto('file://' + path.resolve(__dirname, '../guide.html'));
    const sec = page.locator('#storage');
    await expect(sec.locator('h2')).toContainText('雲端儲存空間怎麼估');
    await expect(sec).toContainText('筆數只是一部分');
    await expect(sec).toContainText('這些數字是假設，不是會議決定');
    await expect(sec.locator('tbody tr')).toHaveCount(4);
    await expect(page.locator('.toc a[href="#storage"]')).toBeVisible();
    // the table in the guide uses the same defaults as the estimator page
    await page.goto(PORTAL);
    const totals = await page.evaluate(() => ['s300', 'p300', 's2000', 'p2000'].map(k => {
      const r = storageCalc({ ...STORAGE_DEF, ...STORAGE_PRESETS[k].v }); return fmtSize(r.totalMB); }));
    expect(totals).toEqual(['7.5 GB', '687.3 GB', '50.3 GB', '4582.1 GB']);
    await page.goto('file://' + path.resolve(__dirname, '../guide.html'));
    for (const v of ['7.5 GB', '687', '50 GB', '4.5 TB']) await expect(sec).toContainText(v);
  });

  test('10/14 changes: role names, directory moved with a department filter, org chart in two tabs', async ({ page }) => {
    await openPortal(page);
    const options = await page.locator('#roleSel option').allTextContents();
    expect(options.some(o => o.includes('管理者（日照主管）'))).toBe(false);
    expect(options.some(o => /^一般員工 \/ Employee$/.test(o.trim()))).toBe(false);
    expect(options.some(o => o.includes('一般員工：照服員'))).toBe(true);
    // the announcement board no longer holds the directory; the formal org chart stays there
    await go(page, 'ann');
    await expect(page.locator('[data-tab="dir"]')).toHaveCount(0);
    await expect(page.locator('[data-tab="org"]')).toBeVisible();
    // the directory is merged into the org chart under Roles & scope, with a department filter
    await go(page, 'perm', 'orgfn');
    await expect(page.locator('[data-tab="dir"]')).toHaveCount(0);
    await expect(page.locator('.leaf[data-node]')).toHaveCount(28);                     // 30 人：老闆與管理者在最上層
    await page.selectOption('#orgDept', 'it');
    await expect(page.locator('.leaf.hit')).toHaveCount(1);
    await page.selectOption('#orgDept', 'ALL');
    // IME: typing in the middle of a composition does not redraw the page; the filter applies when composition ends
    const same = await page.evaluate(() => {
      const i = document.getElementById('orgQ'); i.focus();
      i.dispatchEvent(new CompositionEvent('compositionstart'));
      i.value = '日'; i.dispatchEvent(new InputEvent('input', { isComposing: true, bubbles: true }));
      return document.getElementById('orgQ') === i;
    });
    expect(same).toBe(true);
    await page.evaluate(() => { const i = document.getElementById('orgQ'); i.value = '司機'; i.dispatchEvent(new CompositionEvent('compositionend')); });
    expect(await page.locator('.leaf.hit').count()).toBeGreaterThan(0);
    expect(await page.locator('.leaf.hit').count()).toBeLessThan(28);
    // the working view of the org chart can be edited (demo)
    await page.click('[data-tab="orgfn"]');
    await page.click('[data-orgedit-toggle]');
    const leaf = page.locator('input[data-orgedit]').first();
    await leaf.fill('示範窗口：請找我');
    await leaf.dispatchEvent('change');
    await page.click('[data-orgedit-toggle]');
    await expect(page.locator('#view')).toContainText('示範窗口：請找我');
    // all tables keep their first row and column frozen
    await go(page, 'perm', 'matrix');
    const pos = await page.evaluate(() => [getComputedStyle(document.querySelector('.titlematrix thead th')).position, getComputedStyle(document.querySelector('.titlematrix tbody td')).position]);
    expect(pos).toEqual(['sticky', 'sticky']);
  });

  test('10/14 changes: leave attachment, custom certificate months, no personal work log', async ({ page }) => {
    await openPortal(page);
    await setRole(page, 'employee');
    // leave: attach a file
    await go(page, 'desk', 'forms');
    await page.click('[data-dform="leave"]');
    await page.fill('#leaveForm textarea[name="reason"]', '看診');
    await page.setInputFiles('#leaveForm input[name="file"]', { name: '診斷證明.pdf', mimeType: 'application/pdf', buffer: Buffer.from('demo') });
    await page.click('#leaveForm button[type="submit"]');
    await setRole(page, 'hr');
    await go(page, 'hr', 'leave');
    await expect(page.locator('#view')).toContainText('診斷證明.pdf');
    // insurance certificate: custom month range, whole months
    await setRole(page, 'employee');
    await go(page, 'desk', 'forms');
    await page.click('[data-dform="inscert"]');
    await expect(page.locator('#docForm select[name="period"]')).toHaveCount(0);
    await page.fill('#docForm input[name="pfrom"]', '2026-03');
    await page.fill('#docForm input[name="pto"]', '2026-01');
    await page.fill('#docForm input[name="purpose"]', '貸款');
    await page.click('#docForm button[type="submit"]');
    await expect(page.locator('.toast')).toContainText('結束月份不能早於起始月份');
    await page.fill('#docForm input[name="pto"]', '2026-03');                 // shortest span: one whole month
    await page.click('#docForm button[type="submit"]');
    await expect(page.locator('#view')).toContainText('2026-03 至 2026-03（整月，共 1 個月）');
    // the personal work log is gone from My Desk › Look up
    await go(page, 'desk', 'query');
    await expect(page.locator('[data-dq="log"]')).toHaveCount(0);
  });

  test('the day care supervisor can open the HR pages, limited to their own unit', async ({ page }) => {
    await openPortal(page);
    await setRole(page, 'daydir');
    await go(page, 'hr');
    for (const tab of ['emp', 'mylog', 'att', 'leave']) await expect(page.locator(`[data-tab="${tab}"]`)).toBeVisible();
    await page.click('[data-tab="emp"]');
    await expect(empRows(page)).toHaveCount(10);                 // only the supervisor's own unit
    await expect(page.locator('#view tbody')).not.toContainText('NT$');   // pay stays hidden
  });

  test('continuing-education points: my summary, clickable categories, course list', async ({ page }) => {
    await openPortal(page);
    await setRole(page, 'employee');
    await go(page, 'desk', 'course');
    const v = page.locator('#view');
    for (const x of ['長照人員證號', '專業品質、專業倫理、專業法規累積積分至少 24 點', '各主題已至少完成一堂', '依認證效期至少', '積分計算指引', '至多 80 點', '總積分＝專業課程＋品質、倫理、法規']) await expect(v).toContainText(x);
    await expect(page.locator('[data-ceview]')).toHaveCount(0);                 // an employee has no "everyone" view
    const calc = await page.evaluate(() => { const c = ceCalc('A004'); return { total: c.total, pro: c.s.pro, qel: c.qel, req: c.need }; });
    expect(calc.total).toBeCloseTo(calc.pro + calc.qel, 5);                     // the Excel formula: professional + min(quality+ethics+law, 36)
    expect(calc.qel).toBeLessThanOrEqual(36);
    await expect(v).toContainText(`${calc.total} / 120`);
    // click a number to open the course list, then go back
    await page.locator('[data-cecat]').first().click();
    await expect(v).toContainText('課程日期');
    await expect(v).toContainText('認可狀態');
    expect(await page.locator('.cetable tbody tr').count()).toBeGreaterThan(0);
    await page.click('[data-cemine]');
    await expect(v).toContainText('積分計算指引');
    // a role without the long-term-care requirement sees a notice
    await setRole(page, 'boss');
    await go(page, 'desk', 'course');
    await expect(page.locator('[data-ceview="all"]')).toBeVisible();
  });

  test('continuing-education points: the admin sees everyone, filters, drills into a person and sees the gap analysis', async ({ page }) => {
    await openPortal(page);
    await go(page, 'desk', 'course');
    const v = page.locator('#view');
    await expect(v).toContainText('全員繼續教育積分總表');
    const staff = await page.evaluate(() => ceEligibleStaff().map(p => p.id));
    expect(staff.length).toBe(12);                                              // care attendants, home care workers, supervisors and nurses on the roster
    await expect(page.locator('tr[data-ceemp]')).toHaveCount(12);
    const [tpl] = await Promise.all([page.waitForEvent('download'), page.click('[data-cetemplate]')]);
    expect(tpl.suggestedFilename()).toBe('繼續教育積分匯入範本.xlsx');
    const tplText = fs.readFileSync(await tpl.path()).toString('utf8');
    for (const x of ['繼續教育積分匯入範本', '實施方式', '消防安全', '多元族群文化']) expect(tplText).toContain(x);
    await page.selectOption('#ceTitle', 'rn');
    await expect(page.locator('tr[data-ceemp]')).toHaveCount(3);
    await page.selectOption('#ceTitle', 'ALL');
    await page.selectOption('#ceUnit', 'O3');
    await expect(page.locator('tr[data-ceemp]')).toHaveCount(2);                // C001 and C002 (C003 has left)
    await page.selectOption('#ceUnit', 'ALL');
    // drill into a person, open a category, go back twice
    await page.click('tr[data-ceemp="A004"]');
    await expect(v).toContainText('A004');
    await expect(v).toContainText('積分計算指引');
    await page.locator('[data-cecat]').first().click();
    await expect(v).toContainText('課程日期');
    await page.click('[data-cemine]');
    await page.click('[data-ceback]');
    await expect(v).toContainText('全員繼續教育積分總表');
    // gap analysis
    await page.click('[data-ceview="gap"]');
    await expect(v).toContainText('缺口分析：明年度課程設計');
    await expect(v).toContainText('效期 12 個月內到期');
    // the Excel export
    await page.click('[data-ceview="all"]');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-ceexcel]')]);
    expect(dl.suggestedFilename()).toBe('繼續教育積分總表.xlsx');
    const text = fs.readFileSync(await dl.path()).toString('utf8');
    for (const x of ['繼續教育積分總表', '長照小卡效期', '品質、倫理、法規', 'A004']) expect(text).toContain(x);
    // the day care supervisor sees only their own unit; an employee cannot reach the everyone view
    await setRole(page, 'daydir');
    await go(page, 'desk', 'course');
    expect(await page.locator('tr[data-ceemp]').count()).toBeLessThanOrEqual(6);
    await setRole(page, 'employee');
    await go(page, 'desk', 'course');
    await expect(page.locator('tr[data-ceemp]')).toHaveCount(0);
  });

  test('the scope page leads with 12 action items and keeps the long logs collapsed', async ({ page }) => {
    await openPortal(page);
    const v = page.locator('#view');
    await expect(v).toContainText('行動項目：要結案的 12 件事');
    await expect(page.locator('.actiontable tbody tr')).toHaveCount(12);
    const types = await page.locator('.actiontable tbody tr td:nth-child(2)').allTextContents();
    expect(types.filter(x => x.includes('現在決定')).length).toBe(5);
    expect(types.filter(x => x.includes('等資料')).length).toBe(4);
    expect(types.filter(x => x.includes('IT 研究')).length).toBe(2);
    expect(types.filter(x => x.includes('後續')).length).toBe(1);
    await expect(v).toContainText('建議只是提案');
    // the long logs are collapsed until opened
    const logs = page.locator('details.card');
    await expect(logs).toHaveCount(2);
    await expect(logs.first()).not.toHaveAttribute('open', '');
    await logs.first().locator('summary').click();
    await expect(logs.first()).toContainText('會議決議');
    expect(await logs.first().locator('tbody tr').count()).toBe(await page.evaluate(() => MEETING_DECISIONS.length));
    // an action item links to the page it is about
    await page.locator('.actiontable [data-goto="doc|sysinfo"]').first().click();
    await expect(page.locator('#view')).toContainText('雲端儲存空間估算');
  });
});


/* ================================================================ */
test.describe('仁寶 service-record import (synthetic data only)', () => {
  /* 欄位結構照仁寶匯出（兩列表頭），內容全是虛構：不放任何真實個資 */
  const SAMPLE = [
    ['服務紀錄'],
    ['服務紀錄', '', '', '', '', '', '排班紀錄', '', '', '打卡紀錄', '', '', ''],
    ['編號', '案號', '服務項目類別', '項目服務次數', '服務日期', '服務狀態', '居服員姓名', '', '', '服務日期', '服務時間長度(分)'],
    ['', '', '', '', '', '', '', '', '', '', ''],
  ];
  const rows = [
    ['1', 'T-001', '陪伴服務', '1', '2026-10-05', '', '測試員甲', '', '', '2026-10-05', '60'],
    ['2', 'T-001', '陪伴服務', '1', '2026-10-06', '已簽退', '測試員甲', '', '', '2026-10-06', '30'],
    ['3', 'T-002', '協助沐浴及洗頭', '1', '2026-10-06', '忘簽退', '測試員乙', '', '', '2026-10-06', '90'],
    ['4', 'T-003', '陪伴服務', '1', '2026-10-14', '已簽退', '測試員甲', '', '', '2026-10-14', '30'],
    ['5', 'T-004', '陪伴服務', '1', '2026-10-14', '', '', '', '', '2026-10-14', '30'],
  ];
  async function importSample(page, data) {
    await openPortal(page);
    await go(page, 'svc', 'case');
    const bytes = await page.evaluate(async d => {
      const blob = buildXlsx(d); return Array.from(new Uint8Array(await blob.arrayBuffer()));
    }, data);
    await page.setInputFiles('#svcFile', { name: 'sample.xlsx', mimeType: 'application/octet-stream', buffer: Buffer.from(bytes) });
  }

  test('summarises cases, item shares and worker hours; skips incomplete rows', async ({ page }) => {
    await importSample(page, [...SAMPLE, ...rows]);
    await expect(page.locator('#svcDay')).toBeVisible();
    const v = page.locator('#view');
    await expect(v).toContainText('服務人數：3');      // T-001, T-002, T-003（T-004 缺居服員被略過）
    await expect(v).toContainText('服務紀錄：4');
    await expect(v).toContainText('居服員：2');
    await expect(v).toContainText('總工時：3.5');            // 210 分鐘
    await expect(v).toContainText('有 1 列缺居服員');
    await expect(v).toContainText('「忘簽退」1 列');
    const itemRow = v.locator('tbody tr', { hasText: '陪伴服務' }).first();
    await expect(itemRow).toContainText('75.0%');                        // 3 / 4 次
    const jia = v.locator('tbody tr', { hasText: '測試員甲' });
    await expect(jia).toContainText('2.0');                              // 累積 120 分
    await expect(jia).toContainText('未對到');                           // 示範員工是虛構的，不會對到
  });

  test('day / week hours follow the date picker; clear resets; nothing is stored', async ({ page }) => {
    await importSample(page, [...SAMPLE, ...rows]);
    await page.fill('#svcDay', '2026-10-06');
    const jia = page.locator('#view tbody tr', { hasText: '測試員甲' });
    await expect(jia.locator('td').nth(1)).toHaveText('0.5');            // 當日 30 分
    await expect(jia.locator('td').nth(2)).toHaveText('1.5');            // 10/5–10/11 週：60+30
    expect(await page.evaluate(() => JSON.stringify(Object.keys(localStorage)))).not.toMatch(/svc/);
    await page.click('#svcClear');
    await expect(page.locator('#svcDay')).toHaveCount(0);
  });

  test('a file without the required columns gives a clear message', async ({ page }) => {
    await importSample(page, [['隨便'], ['A', 'B'], ['1', '2']]);
    await expect(page.locator('#svcMsg')).toContainText('找不到表頭');
    await expect(page.locator('#svcDay')).toHaveCount(0);
  });
});


test.describe('Trimmed menus', () => {
  test('rarely used pages sit under 更多頁面 and links still reach them', async ({ page }) => {
    await openPortal(page);
    await page.click('[data-mod="doc"]');
    await expect(page.locator('[data-tab="sysinfo"]')).toHaveCount(0);
    await expect(page.locator('[data-tab="meeting"]')).toBeVisible();
    await page.click('#moreToggle');
    await expect(page.locator('[data-tab="sysinfo"]')).toBeVisible();
    await page.click('#moreToggle');
    await expect(page.locator('[data-tab="sysinfo"]')).toHaveCount(0);
    // 行動項目的連結會自動展開
    await go(page, 'arch', 'scope');
    await page.locator('.actiontable [data-goto="doc|sysinfo"]').first().click();
    await expect(page.locator('#view')).toContainText('雲端儲存空間估算');
  });
  test('Chinese mode shows Chinese only; EN switches the whole page to English', async ({ page }) => {
    await openPortal(page);
    await expect(page.locator('.page-head .sub, .sub')).toBeHidden();
    await expect(page.locator('#view')).not.toContainText(/ \/ [A-Z][a-z]+ [a-z]+/);
    await page.click('[data-lang="en"]');
    await expect(page.locator('.navitem').first()).toContainText('Prototype Info');
  });
});


test.describe('Meeting agenda in the guide', () => {
  test('guide lists the six agenda items with a message colleagues can copy', async ({ page }) => {
    await page.goto('file://' + path.resolve(__dirname, '../guide.html'));
    const sec = page.locator('#agenda');
    await expect(sec.locator('h2')).toContainText('下次會議議程');
    await expect(sec.locator('tbody tr')).toHaveCount(6);
    await expect(sec.locator('tbody tr').nth(5)).toContainText('手機版打卡與工時');
    await expect(sec).toContainText('簽核層級');
    await expect(sec).toContainText('仁寶匯入');
    await expect(sec).toContainText('會前請準備');
    await expect(sec.locator('.note').last().locator('li')).toHaveCount(12);        // 訊息用條列：6 項議程 + 6 項請補資料
    await expect(sec).toContainText('請用自己的手機試一下手機版');
    await expect(sec).toContainText('謝謝提供組織圖 V3 與雲端方案比較');
    await expect(sec).toContainText('各表單簽到哪一層與金額門檻');
    await expect(sec.locator('a[href="mobile.html"], .mono')).not.toHaveCount(0);
    await expect(page.locator('.toc a[href="#agenda"]')).toBeVisible();
  });
});

test.describe('Phone width (390px)', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });
  test('no page overflows sideways and buttons are big enough to tap', async ({ page }) => {
    await openPortal(page);
    const mods = await page.$$eval('[data-mod]', e => e.map(x => x.dataset.mod));
    for (const m of mods) {
      await page.evaluate(m => { state.module = m; state.tab = null; state.more = true; render(); }, m);
      const tabs = await page.$$eval('[data-tab]', e => e.map(x => x.dataset.tab));
      for (const t of (tabs.length ? tabs : [null])) {
        if (t) await page.evaluate(t => { state.tab = t; render(); }, t);
        const r = await page.evaluate(() => ({
          over: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          small: [...document.querySelectorAll('button,a.btn,select,input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=file])')]
            .filter(e => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height < 39.5 && !e.classList.contains('navitem'); }).length   // 主選單項目 37px，刻意不放大以免手機上選單佔滿畫面
        }));
        expect(r.over, `${m}/${t} overflows`).toBeLessThanOrEqual(2);
        expect(r.small, `${m}/${t} has small tap targets`).toBe(0);
      }
    }
  });
});

test.describe('Day / night theme', () => {
  test('switch sets the theme, is remembered after reload, and auto follows the device', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await openPortal(page);
    const bg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const light = await bg();
    await page.click('[data-theme-set="dark"]');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    expect(await bg()).not.toBe(light);
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.locator('[data-theme-set="dark"]')).toHaveAttribute('aria-pressed', 'true');
    await page.click('[data-theme-set="auto"]');
    await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.+/);
    expect(await bg()).toBe(light);                       // 裝置是日間 → 自動 = 日間
    await page.emulateMedia({ colorScheme: 'dark' });
    expect(await bg()).not.toBe(light);                   // 裝置改夜間 → 自動跟著變
    await page.click('[data-theme-set="light"]');
    expect(await bg()).toBe(light);                       // 手動日間蓋過裝置的夜間
  });
});

test.describe('Manager to-do', () => {
  test('to-do button shows the count and opens a page that follows the role', async ({ page }) => {
    await openPortal(page);
    await setRole(page, 'hr');
    const n = +(await page.locator('#todoBtn .chip').innerText());
    expect(n).toBeGreaterThan(0);
    await page.click('#todoBtn');
    await expect(page.locator('[data-tab="todo"]')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#view')).toContainText('待我簽核');
    await expect(page.locator('#view')).toContainText('證照 90 天內到期');
    await expect(page.locator('.todostrip .tot b')).toHaveText(String(n));
    await page.locator('#view [data-goto="hr|leave"]').first().click();      // 按鈕直接帶到請假審核
    await expect(page.locator('[data-tab="leave"]')).toHaveAttribute('aria-selected', 'true');
    await setRole(page, 'employee');
    await expect(page.locator('#todoBtn')).toHaveCount(0);                  // 一般員工沒有待辦按鈕
  });
  test('the to-do page is not a row in the permission matrix', async ({ page }) => {
    await openPortal(page);
    await go(page, 'perm', 'matrix');
    await expect(page.locator('table.titlematrix')).not.toContainText('今日待辦');
  });
});

test.describe('Collapsible main menu on phones', () => {
  test('menu is collapsed on a phone, opens with the Menu button and closes after choosing', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openPortal(page);
    await expect(page.locator('[data-mod="hr"]')).toBeHidden();
    await expect(page.locator('#navToggle')).toContainText('原型說明');
    await page.click('#navToggle');
    await expect(page.locator('#navToggle')).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('[data-mod="hr"]')).toBeVisible();
    await page.click('[data-mod="hr"]');
    await expect(page.locator('[data-mod="hr"]')).toBeHidden();
    await expect(page.locator('#navToggle')).toContainText('人事系統');
  });
  test('on a desktop the menu is always open and the Menu button is hidden', async ({ page }) => {
    await page.setViewportSize({ width: 1300, height: 800 });
    await openPortal(page);
    await expect(page.locator('#navToggle')).toBeHidden();
    await expect(page.locator('[data-mod="hr"]')).toBeVisible();
  });
});

test.describe('Collapsible filter bar on phones', () => {
  test('filters are collapsed on a phone, the to-do button stays, and the bar opens on tap', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openPortal(page);
    await expect(page.locator('#roleSel')).toBeHidden();
    await expect(page.locator('#utilToggle')).toContainText('系統管理員');
    await expect(page.locator('#todoBtn')).toBeVisible();                 // 待辦件數一直看得到
    await page.click('#utilToggle');
    await expect(page.locator('#roleSel')).toBeVisible();
    await expect(page.locator('[data-theme-set="dark"]')).toBeVisible();
    await setRole(page, 'hr');                                             // 切換身分後仍保持展開
    await expect(page.locator('#utilToggle')).toContainText('人資');
    await page.click('#navToggle');
    await page.click('[data-mod="hr"]');                                   // 換頁後收起
    await expect(page.locator('#roleSel')).toBeHidden();
  });
  test('on a desktop the filter bar is always open and the toggle is hidden', async ({ page }) => {
    await page.setViewportSize({ width: 1300, height: 800 });
    await openPortal(page);
    await expect(page.locator('#utilToggle')).toBeHidden();
    await expect(page.locator('#roleSel')).toBeVisible();
  });
});

test.describe('Attendance squares in dark mode', () => {
  test('on-time squares stand out from the row background (contrast at least 3:1)', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await openPortal(page);
    await page.click('[data-theme-set="dark"]');
    await go(page, 'hr', 'att');
    const ratio = await page.evaluate(() => {
      const rgb = c => c.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number);
      const lum = c => { const [r, g, b] = rgb(c).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }); return .2126 * r + .7152 * g + .0722 * b; };
      const cell = document.querySelector('.attcell:not(.late):not(.leave):not(.miss):not(.off)');
      const bg = getComputedStyle(cell.closest('tr')).backgroundColor;
      const base = bg.includes('0, 0, 0, 0') || bg === 'transparent' ? getComputedStyle(cell.closest('.card, section')).backgroundColor : bg;
      const a = lum(getComputedStyle(cell).backgroundColor), b = lum(base);
      return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
    });
    expect(ratio).toBeGreaterThanOrEqual(3);
  });
});

/* ================================================================ */
test.describe('Mobile app (PWA) — mobile.html', () => {
  const M = 'file://' + path.resolve(__dirname, '../mobile.html');
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const openM = async page => { await page.goto(M); await expect(page.locator('#punchBtn')).toBeVisible(); };
  const tab = (page, t) => page.click(`[data-tab="${t}"]`);

  test('four tabs, demo notice, and no real location or camera is requested', async ({ page }) => {
    const asked = [];
    await page.addInitScript(() => {
      window.__perm = [];
      if (navigator.geolocation) { const g = navigator.geolocation.getCurrentPosition; navigator.geolocation.getCurrentPosition = (...a) => { window.__perm.push('geo'); return g.apply(navigator.geolocation, a); }; }
      if (navigator.mediaDevices) { const m = navigator.mediaDevices.getUserMedia; navigator.mediaDevices.getUserMedia = (...a) => { window.__perm.push('cam'); return m.apply(navigator.mediaDevices, a); }; }
    });
    await openM(page);
    await expect(page.locator('#tabs button')).toHaveText([/打卡/, /工時/, /請假/, /月曆/]);
    await expect(page.locator('.demo')).toContainText('虛構');
    await expect(page.locator('#loc')).toContainText('位置只給後台看');          // 員工手機介面不顯示位置（10/20）
    await expect(page.locator('#view')).not.toContainText(/📍|\d+\.\d+\.\d+\.\d+/);
    await page.click('#punchBtn');
    expect(await page.evaluate(() => window.__perm)).toEqual(asked);
  });

  test('punch in, punch out, survives reload, and can be cleared', async ({ page }) => {
    await openM(page);
    await expect(page.locator('#punchBtn')).toContainText('上班打卡');
    await page.click('#punchBtn');
    await expect(page.locator('.toast')).toContainText('上班打卡完成');
    await expect(page.locator('#punchBtn')).toContainText('下班打卡');
    await page.reload();                                                    // 資料存在手機本機
    await expect(page.locator('#punchBtn')).toContainText('下班打卡');
    await page.click('#punchBtn');
    await expect(page.locator('.punch[disabled]')).toContainText('今日已完成');
    await page.click('#undoPunch');
    await expect(page.locator('#punchBtn')).toContainText('上班打卡');
  });

  test('overtime form validates, computes hours (also across midnight) and lists the request', async ({ page }) => {
    await openM(page);
    await tab(page, 'hours');
    await page.click('#otForm .btn');
    await expect(page.locator('#otErr')).toContainText('請填寫事由');
    await page.fill('#otWhy', '個案家屬臨時需要協助');
    await page.click('#otForm .btn');
    await expect(page.locator('.toast')).toContainText('加班單已送出');
    await expect(page.locator('#view')).toContainText('個案家屬臨時需要協助');
    await expect(page.locator('#view')).toContainText('2.0 小時');
    await page.fill('#otFrom', '22:00'); await page.fill('#otTo', '01:00'); await page.fill('#otWhy', '夜間支援');
    await page.click('#otForm .btn');
    await expect(page.locator('#view')).toContainText('3.0 小時');
    await expect(page.locator('.stat', { hasText: '待簽核申請' }).locator('.v')).toHaveText('2');
  });

  test('missed-punch request and leave request, including validation and withdraw', async ({ page }) => {
    await openM(page);
    await tab(page, 'hours');
    await page.click('[data-hv="fix"]');
    await page.click('#fixForm .btn');
    await expect(page.locator('#fxErr')).toContainText('請填寫事由');
    await page.fill('#fxWhy', '手機沒電');
    await page.click('#fixForm .btn');
    await expect(page.locator('.toast')).toContainText('補刷卡已送出');
    await tab(page, 'leave');
    await page.fill('#lvWhy', '回診');
    await page.fill('#lvFrom', '2026-10-20'); await page.fill('#lvTo', '2026-10-19');
    await page.click('#lvForm .btn');
    await expect(page.locator('#lvErr')).toContainText('結束日期不能早於開始日期');
    await page.fill('#lvTo', '2026-10-20');
    await page.click('#lvForm .btn');
    await expect(page.locator('.toast')).toContainText('請假已送出');
    await expect(page.locator('#view')).toContainText('回診');
    await expect(page.locator('.stat', { hasText: '特休' }).locator('.v')).toHaveText('32');   // 待簽核的 8 小時先保留
    await page.click('[data-withdraw]');
    await expect(page.locator('.chip', { hasText: '已撤回' })).toHaveCount(1);
  });

  test('calendar: statuses have text (not colour only), tapping a day shows its record', async ({ page }) => {
    await openM(page);
    await tab(page, 'cal');
    await expect(page.locator('.cal .h')).toHaveCount(7);
    const labels = await page.locator('[data-day] i').allInnerTexts();
    expect(labels.some(x => x === '休')).toBe(true);                         // 週末有文字標示
    await page.locator('[data-day]').nth(0).click();
    await expect(page.locator('#view')).toContainText('狀態');
    await expect(page.locator('[data-day].sel')).toHaveCount(1);
  });

  test('Chinese (Zhuyin) composition in a reason box is not interrupted by the clock or re-render', async ({ page }) => {
    await openM(page);
    await tab(page, 'hours');
    await page.focus('#otWhy');
    await page.evaluate(() => { window.__n = document.getElementById('otWhy'); });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.imeSetComposition', { text: 'ㄓㄨㄥ', selectionStart: 3, selectionEnd: 3 });
    await page.waitForTimeout(2200);                                         // 時鐘跳了兩次以上
    expect(await page.evaluate(() => document.activeElement === window.__n && document.body.contains(window.__n))).toBe(true);
    await cdp.send('Input.insertText', { text: '中文' });
    await expect(page.locator('#otWhy')).toHaveValue('中文');
  });

  test('no sideways scrolling and every tap target is at least 44px at common phone widths', async ({ page }) => {
    for (const w of [320, 360, 390, 430]) {
      await page.setViewportSize({ width: w, height: 800 });
      await openM(page);
      for (const t of ['punch', 'hours', 'leave', 'cal']) {
        await tab(page, t);
        const r = await page.evaluate(() => ({
          over: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          small: [...document.querySelectorAll('button,select,input:not([type=hidden]),textarea,a')].filter(e => { const b = e.getBoundingClientRect(); return b.width > 0 && !e.classList.contains('blank') && b.height < 43.5; }).map(e => e.id || e.className || e.tagName)
        }));
        expect(r.over, `${w}px ${t} overflows`).toBeLessThanOrEqual(1);
        expect(r.small, `${w}px ${t} small targets`).toEqual([]);
      }
    }
  });

  test('theme button cycles auto → day → night and shares the portal preference', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await openM(page);
    await page.click('#themeBtn'); await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.click('#themeBtn'); await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    expect(await page.evaluate(() => localStorage.getItem('zx-theme'))).toBe('dark');
    await page.click('#themeBtn'); await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.+/);
  });

  test('install files: manifest, icons of the right size, service worker and iOS tags', async () => {
    const root = path.resolve(__dirname, '..');
    const mf = JSON.parse(fs.readFileSync(path.join(root, 'manifest.webmanifest'), 'utf8'));
    expect(mf.display).toBe('standalone');
    expect(mf.start_url).toBe('mobile.html');
    expect(mf.lang).toBe('zh-Hant');
    const purposes = mf.icons.map(i => i.purpose);
    expect(purposes).toEqual(expect.arrayContaining(['any', 'maskable']));
    for (const ic of mf.icons) {
      const buf = fs.readFileSync(path.join(root, ic.src));
      expect(buf.subarray(1, 4).toString()).toBe('PNG');
      const [w, h] = ic.sizes.split('x').map(Number);
      expect([buf.readUInt32BE(16), buf.readUInt32BE(20)]).toEqual([w, h]);
    }
    const apple = fs.readFileSync(path.join(root, 'icons/apple-touch-icon.png'));
    expect([apple.readUInt32BE(16), apple.readUInt32BE(20)]).toEqual([180, 180]);
    const html = fs.readFileSync(path.join(root, 'mobile.html'), 'utf8');
    for (const s of ['rel="manifest"', 'rel="apple-touch-icon"', 'apple-mobile-web-app-capable', 'viewport-fit=cover', 'safe-area-inset-bottom']) expect(html).toContain(s);
    const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
    for (const f of ['mobile.html', 'manifest.webmanifest']) expect(sw).toContain(f);
    expect(html).not.toMatch(/[A-Z][12]\d{8}/);                              // 沒有身分證字號格式的字串
  });
});


test.describe('Formal org chart layout, upload formats, version and revision date', () => {
  test('formal org chart is a top-down chart that fits one screen on a normal laptop', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openPortal(page);
    await go(page, 'ann', 'org');
    const chart = page.locator('.orgf');
    await expect(chart.locator('.orgf-top .orgbox')).toHaveText([/老闆/, /管理者/]);   // 上面：老闆 → 管理者
    await expect(chart.locator('.orgf-row > .orgcol')).toHaveCount(5);                 // 下面一排：共用行政 + 4 個主體單位
    await expect(chart.locator('.orgbox.unit').first()).toBeVisible();
    await expect(chart.locator('.orgf-float .orgbox.float')).toHaveCount(2);            // 跨單位主管（虛線）
    const m = await page.evaluate(() => ({ docH: document.documentElement.scrollHeight, vh: innerHeight, over: document.documentElement.scrollWidth - document.documentElement.clientWidth }));
    expect(m.docH).toBeLessThanOrEqual(m.vh + 2);                                       // 不用往下捲
    expect(m.over).toBeLessThanOrEqual(1);
    // 上層在下層的上方、四家公司在同一排
    const ys = await chart.locator('.orgf-row > .orgcol > .orgbox.ent').evaluateAll(n => n.map(e => Math.round(e.getBoundingClientRect().top)));
    expect(new Set(ys).size).toBe(1);
    const topY = await chart.locator('.orgf-top .orgbox').first().evaluate(e => e.getBoundingClientRect().top);
    expect(topY).toBeLessThan(ys[0]);
  });
  test('on a narrow screen the formal org chart stacks instead of overflowing', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openPortal(page);
    await page.evaluate(() => { state.module = 'ann'; state.tab = 'org'; render(); });
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(over).toBeLessThanOrEqual(1);
  });

  test('every upload box lists the accepted formats (including HEIC), and an unsupported file is refused', async ({ page }) => {
    await openPortal(page);
    await setRole(page, 'employee');
    await go(page, 'desk', 'forms');
    const input = page.locator('input[type=file][data-up]').first();
    await expect(input).toHaveAttribute('accept', /\.heic/);
    for (const e of ['.pdf', '.png', '.jpg', '.docx', '.xlsx']) await expect(input).toHaveAttribute('accept', new RegExp(e.replace('.', '\\.')));
    await expect(page.locator('.uphint').first()).toContainText('HEIC');
    await expect(page.locator('.uphint').first()).toContainText('PDF');
    await expect(page.locator('.uphint').first()).toContainText('大小上限待決定');
    await input.setInputFiles({ name: 'virus.exe', mimeType: 'application/octet-stream', buffer: Buffer.from('x') });
    await expect(page.locator('.toast')).toContainText('不接受 .exe');
    expect(await input.evaluate(i => i.files.length)).toBe(0);
    await input.setInputFiles({ name: 'IMG_0001.HEIC', mimeType: 'image/heic', buffer: Buffer.from('x') });
    expect(await input.evaluate(i => i.files.length)).toBe(1);                         // iPhone 照片可以選
  });
  test('the 仁寶 import says it reads only .xlsx and explains other formats', async ({ page }) => {
    await openPortal(page);
    await go(page, 'svc', 'case');
    await expect(page.locator('#view')).toContainText('只收 .xlsx');
    await page.setInputFiles('#svcFile', { name: 'old.xls', mimeType: 'application/vnd.ms-excel', buffer: Buffer.from('x') });
    await expect(page.locator('#svcMsg')).toContainText('只收 .xlsx');
  });

  test('version is v3.4 and the footer shows the revision date, not the demo date', async ({ page }) => {
    await openPortal(page);
    await expect(page.locator('.brand')).toContainText('v3.4');
    const foot = page.locator('.rail-foot');
    await expect(foot).toContainText('v3.4');
    await expect(foot).toContainText('修訂');
    await expect(foot).toContainText(/\d{4}-\d{2}-\d{2}/);
    await expect(foot).not.toContainText('展示日期');
    await go(page, 'set');
    await expect(page.locator('#view')).toContainText('修訂日期');
    await expect(page.locator('#view')).toContainText('v3.4');
    const rev = await page.evaluate(() => [APP_VERSION, APP_REVISION]);
    expect(rev[0]).toBe('3.4');
    expect(rev[1]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  test('guide, index and mobile app show the same version and a revision date', async ({ page }) => {
    for (const f of ['guide.html', 'index.html']) {
      await page.goto('file://' + path.resolve(__dirname, '../' + f));
      await expect(page.locator('body')).toContainText('v3.4');
      await expect(page.locator('[data-rev]').first()).toHaveText(/^\d{4}-\d{2}-\d{2}$/);
    }
    await page.goto('file://' + path.resolve(__dirname, '../mobile.html'));
    await expect(page.locator('#ver')).toContainText(/v3\.4・修訂 \d{4}-\d{2}-\d{2}/);
  });
  test('the deploy workflow stamps the revision date from the last commit', async () => {
    const w = fs.readFileSync(path.resolve(__dirname, '../.github/workflows/deploy.yml'), 'utf8');
    expect(w).toContain('APP_REVISION');
    expect(w).toContain('data-rev');
    expect(w).toContain('Asia/Taipei');
  });
});

test.describe('仁寶 import accepts .csv', () => {
  const CSV = '案號,服務項目類別,項目服務次數,居服員姓名,服務日期,服務時間長度(分)\r\nT-001,陪伴服務,1,測試員甲,2026/10/5,60\r\nT-002,"協助沐浴,洗頭",1,測試員乙,2026-10-06,90\r\n';
  const BIG5_B64 = 'rte4uSyqQbDItrWl2MP+p08strWl2KpBsMimuLzGLKl+qkGt+6ltplcsqkGwyKTptMEsqkGwyK7JtqGq+KvXKKTAKQ0KVC0wMDEss62m8apBsMgsMSy0+rjVrful0iwyMDI2LzEwLzUsNjANClQtMDAyLCKo86dVqE6vRCysfsBZIiwxLLT6uNWt+6RBLDIwMjYtMTAtMDYsOTANCg==';
  const openCase = async page => { await openPortal(page); await go(page, 'svc', 'case'); };
  const expectSummary = async page => {
    const v = page.locator('#view');
    await expect(v).toContainText('服務人數：2');
    await expect(v).toContainText('服務紀錄：2');
    await expect(v).toContainText('居服員：2');
    await expect(v).toContainText('總工時：2.5');                      // 150 分鐘
    await expect(v).toContainText('協助沐浴,洗頭');                    // 引號裡的逗號不會把欄位切開
    await expect(v.locator('tbody tr', { hasText: '測試員甲' })).toContainText('1.0');
  };
  test('UTF-8 csv with BOM, CRLF, quoted commas and slash dates', async ({ page }) => {
    await openCase(page);
    await expect(page.locator('#svcFile')).toHaveAttribute('accept', /\.csv/);
    await expect(page.locator('#view')).toContainText('.csv');
    await page.setInputFiles('#svcFile', { name: 'sample.csv', mimeType: 'text/csv', buffer: Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(CSV, 'utf8')]) });
    await expectSummary(page);
  });
  test('Big5 csv (what Excel saves on Traditional Chinese Windows) reads correctly', async ({ page }) => {
    await openCase(page);
    await page.setInputFiles('#svcFile', { name: 'sample-big5.csv', mimeType: 'text/csv', buffer: Buffer.from(BIG5_B64, 'base64') });
    await expectSummary(page);
  });
  test('a csv without the required columns gives the same clear message', async ({ page }) => {
    await openCase(page);
    await page.setInputFiles('#svcFile', { name: 'bad.csv', mimeType: 'text/csv', buffer: Buffer.from('a,b\r\n1,2\r\n', 'utf8') });
    await expect(page.locator('#svcMsg')).toContainText('找不到表頭');
  });
  test('.xls and other formats are still refused with a pointer to .xlsx / csv', async ({ page }) => {
    await openCase(page);
    await page.setInputFiles('#svcFile', { name: 'old.xls', mimeType: 'application/vnd.ms-excel', buffer: Buffer.from('x') });
    await expect(page.locator('#svcMsg')).toContainText('只收 .xlsx 和 .csv');
  });
});


test.describe('v3.2 section in the guide', () => {
  test('records the csv support, upload formats and revision date, with a table of import formats', async ({ page }) => {
    await page.goto('file://' + path.resolve(__dirname, '../guide.html'));
    const sec = page.locator('#newv32');
    await expect(sec.locator('h2')).toContainText('v3.2 更新（10/19）');
    for (const s of ['.csv', 'Big5', 'HEIC', '修訂日期', '傘狀圖', '找不到表頭', '服務個案數']) await expect(sec).toContainText(s);
    await expect(sec.locator('tbody tr')).toHaveCount(4);
    await expect(page.locator('.toc a[href="#newv32"]')).toBeVisible();
  });
});


test.describe('To-do grid, employee column filters, org chart with directory', () => {
  test('to-do page lays its tables out side by side and fits one screen', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openPortal(page);
    await setRole(page, 'hr');
    await page.click('#todoBtn');
    const cards = page.locator('.todocard');
    expect(await cards.count()).toBeGreaterThanOrEqual(4);
    const tops = await cards.evaluateAll(n => n.map(e => Math.round(e.getBoundingClientRect().top)));
    expect(tops.filter(t => t === tops[0]).length).toBeGreaterThanOrEqual(2);          // 同一排至少兩張卡
    await expect(page.locator('.todotbl').first()).toBeVisible();
    const m = await page.evaluate(() => ({ h: document.documentElement.scrollHeight, vh: innerHeight }));
    expect(m.h).toBeLessThanOrEqual(m.vh + 2);                                           // 不用往下捲
    expect(await page.locator('.todotbl tbody tr').count()).toBeGreaterThan(8);          // 一頁看到多筆
  });

  test('employee records: every row is one line and each column has its own filter', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openPortal(page);
    await go(page, 'hr', 'emp');
    const hs = await page.locator('.emptable tbody tr').evaluateAll(n => n.map(e => Math.round(e.getBoundingClientRect().height)));
    expect(Math.max(...hs)).toBeLessThan(46);                                            // 一行（不換行）
    await expect(page.locator('.emptable tr.filters [data-cf]')).toHaveCount(8);          // 8 欄有篩選（月薪欄人資才有）
    const all = await page.locator('.emptable tbody tr').count();
    await page.selectOption('[data-cf="unit"]', { index: 2 });
    const byUnit = await page.locator('.emptable tbody tr').count();
    expect(byUnit).toBeGreaterThan(0); expect(byUnit).toBeLessThan(all);
    await page.selectOption('[data-cf="type"]', 'part');                                  // 兩個欄位一起篩
    expect(await page.locator('.emptable tbody tr').count()).toBeLessThanOrEqual(byUnit);
    await page.click('[data-cf-clear]');
    expect(await page.locator('.emptable tbody tr').count()).toBe(all);
    await page.fill('[data-cf="id"]', 'a00');
    expect(await page.locator('.emptable tbody tr').count()).toBeLessThan(all);
    await expect(page.locator('.emptable tbody tr').first().locator('td').first()).toContainText('A00');
  });
  test('employee records: Zhuyin typing in a column filter is not interrupted; pay filter only for roles that see pay', async ({ page }) => {
    await openPortal(page);
    await setRole(page, 'hr');
    await go(page, 'hr', 'emp');
    const same = await page.evaluate(() => {
      const i = document.querySelector('[data-cf="name"]'); i.focus();
      i.dispatchEvent(new CompositionEvent('compositionstart'));
      i.value = '護'; i.dispatchEvent(new InputEvent('input', { isComposing: true, bubbles: true }));
      return document.querySelector('[data-cf="name"]') === i;                            // 組字中不重畫
    });
    expect(same).toBe(true);
    await page.evaluate(() => { const i = document.querySelector('[data-cf="name"]'); i.value = '護理師'; i.dispatchEvent(new CompositionEvent('compositionend')); });
    expect(await page.locator('.emptable tbody tr').count()).toBeGreaterThan(0);
    await expect(page.locator('.emptable tr.filters [data-cf="pay"]')).toHaveCount(1);   // 人資看得到月薪，所以有月薪篩選
    await setRole(page, 'daydir');
    await go(page, 'hr', 'emp');
    await expect(page.locator('.emptable tr.filters [data-cf="pay"]')).toHaveCount(0);
  });

  test('org chart and directory are one page: click a person for extension, phone, mobile and email', async ({ page }) => {
    await openPortal(page);
    await go(page, 'perm', 'orgfn');
    await expect(page.locator('[data-tab="dir"]')).toHaveCount(0);
    await page.locator('.leaf[data-node="A002"]').click();
    const card = page.locator('.contactcard');
    await expect(card).toContainText('分機');
    await expect(card.locator('a[href^="tel:"]')).toHaveCount(2);                          // 電話、手機
    await expect(card.locator('a[href^="mailto:"]')).toHaveCount(1);
    await expect(card.locator('a[href^="mailto:"]')).toContainText('@');
    await card.locator('[data-contact-open]').click();                                    // 完整人事資料
    await expect(drawer(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await page.evaluate(() => { state.contactId = null; render(); });
    await expect(page.locator('.contactcard')).toHaveCount(0);
    await page.fill('#orgQ', '司機');
    expect(await page.locator('.leaf.hit').count()).toBeGreaterThan(0);                   // 符合的標出來
    expect(await page.locator('.leaf.dim').count()).toBeGreaterThan(0);                   // 其他變淡
  });
  test('the contact card follows scope and the mobile-number right', async ({ page }) => {
    await openPortal(page);
    await setRole(page, 'employee');
    await go(page, 'perm', 'orgfn');
    const mobileOk = await page.evaluate(() => can('mobile'));
    await page.locator('.leaf[data-node="A002"]').click();                                // 同一家公司的同仁
    const card = page.locator('.contactcard');
    await expect(card).toBeVisible();
    await expect(card.locator('a[href^="mailto:"]')).toHaveCount(1);
    await expect(card.locator('a[href^="tel:"]')).toHaveCount(mobileOk ? 2 : 1);          // 沒有手機權限就只有公司電話
    if (!mobileOk) await expect(card.locator('.lock')).toContainText('僅人資');
    await page.locator('.leaf[data-node="B001"]').click();                                // 別家公司的同仁：只看得到職位
    await expect(page.locator('.contactcard')).toContainText('不在您目前的資料範圍內');
    await expect(page.locator('.contactcard a[href^="mailto:"]')).toHaveCount(0);
  });
});


test.describe('v3.3: org chart V3 approval levels and cloud plan comparison', () => {
  test('approval levels from org chart V3: five chains that all end at the manager and the owner, positions only', async ({ page }) => {
    await openPortal(page);
    await go(page, 'fin', 'proc');
    const card = page.locator('#apV3');
    await expect(card.locator('h2')).toContainText('組織圖 V3 的簽核層級');
    const chains = await card.locator('.blkchain').evaluateAll(n => n.map(c => [...c.querySelectorAll('.blk')].map(b => b.textContent.trim())));
    expect(chains).toHaveLength(5);
    for (const c of chains) expect(c.slice(-2)).toEqual(['管理者', '老闆']);                // 每一條都到管理者，再到老闆
    expect(chains[0]).toEqual(['居服員', '居家服務督導', '居服主管（業務負責人）', '管理者', '老闆']);
    expect(chains[1]).toEqual(['照服員、司機', '日照社工', '日照主管（業務負責人）', '管理者', '老闆']);
    expect(chains[3]).toEqual(['教育訓練專員', 'HR（人資主管）', '管理者', '老闆']);
    expect(chains[4]).toEqual(['會計', '管理者', '老闆']);
    await expect(card.locator('tbody tr')).toHaveCount(5);                                 // 5 個機構的主管位置
    const allowed = new Set(['居服員', '居家服務督導', '居服主管（業務負責人）', '管理者', '老闆', '照服員、司機', '日照社工', '日照主管（業務負責人）', 'A個管', 'A個管主管', '教育訓練專員', 'HR（人資主管）', '會計']);
    for (const c of chains) for (const b of c) expect(allowed.has(b), `unexpected block ${b}`).toBe(true);   // 只有職位，沒有人名
    await expect(card).toContainText('各表單');
    await expect(card).toContainText('只放職位');
  });
  test('cloud plan comparison: both tables, a head-count calculator, and the reminders', async ({ page }) => {
    await openPortal(page);
    await go(page, 'doc', 'sysinfo');
    const card = page.locator('#cloudCmp');
    await expect(card.locator('h2')).toContainText('雲端方案比較');
    await expect(card).toContainText('價格未查證');
    for (const s of ['Lightsail', 'Compute Engine', 'App Service', '彰化', 'Business Starter', 'Business Standard', 'SharePoint', '2026/7/1']) await expect(card).toContainText(s);
    await expect(card.locator('#cloudOut')).toContainText('US$2,100');                      // 300 人 × US$7
    await expect(card.locator('#cloudOut')).toContainText('US$4,200');                      // 300 人 × US$14
    await card.locator('#cloudForm [name=n]').fill('2000');
    await expect(card.locator('#cloudOut')).toContainText('US$28,000');                     // 2,000 人 × US$14
    await expect(card.locator('#cloudOut')).toContainText('US$336,000');                    // 一年
    await expect(card).toContainText('全公司共用');                                          // 我的提醒：空間算法請確認
    await expect(card).toContainText('居服員都要帳號');
  });
  test('the guide records the 20 Oct update and the repaired agenda table', async ({ page }) => {
    await page.goto('file://' + path.resolve(__dirname, '../guide.html'));
    const sec = page.locator('#newv33');
    await expect(sec.locator('h2')).toContainText('v3.3 更新（10/20）');
    for (const s of ['組織圖 V3', '雲端方案比較', '沒有查證', '只放職位']) await expect(sec).toContainText(s);
    await expect(page.locator('.toc a[href="#newv33"]')).toBeVisible();
    await expect(page.locator('#agenda tbody tr')).toHaveCount(6);
    await expect(page.locator('#confirm tbody tr').nth(2)).toContainText('員工編號原則');   // 待補齊清單第 3 列是員編，不是議程
    await expect(page.locator('#agenda tbody tr').nth(2)).toContainText('雲端方案比較');
  });
});


test.describe('10/20 meeting: org tree, approval forms, 仁寶 summary', () => {
  test('誠馨健康 has care attendants and drivers under day care, like the other day-care units', async ({ page }) => {
    await openPortal(page);
    await go(page, 'ann', 'org');
    const col = page.locator('.orgf-row > .orgcol').filter({ hasText: '誠馨健康股份有限公司' });
    await expect(col).toContainText('照服員、司機');
    await expect(col).toContainText('日照社工');
  });
  test('three confirmed approval forms with the same flow, and the five deck originals marked as to confirm', async ({ page }) => {
    await openPortal(page);
    await go(page, 'fin', 'proc');
    const rows = page.locator('#view table').first().locator('tbody tr');
    for (const [i, name] of ['報價單', '出差申請', '零佣金申請'].entries()) {
      await expect(rows.nth(i)).toContainText(name);
      await expect(rows.nth(i)).toContainText('已確認');
      await expect(rows.nth(i)).toContainText('依組織圖 V3 逐層往上簽');
    }
    await expect(rows.nth(3)).toContainText('採購申請');
    await expect(rows.nth(3)).toContainText('簡報原案');
  });
  const SAMPLE = [
    ['案號', '服務項目類別', '項目服務次數', '居服員姓名', '服務日期', '服務時間長度(分)', '服務單位', '服務狀態'],
    ['T-001', '陪伴服務', '1', '測試員甲', '2026-09-30', '60', '機構一', '已簽退'],
    ['T-002', '陪伴服務', '1', '測試員乙', '2026-10-02', '90', '機構一', '忘簽退'],
    ['T-002', '協助沐浴及洗頭', '1', '測試員乙', '2026-10-03', '30', '機構二', '服務未遇(新制)'],
    ['T-003', '陪伴服務', '1', '測試員甲2', '2026-10-04', '60', '機構一', '已簽退'],
  ];
  async function importRows(page, data) {
    await openPortal(page);
    await go(page, 'svc', 'case');
    const bytes = await page.evaluate(async d => Array.from(new Uint8Array(await buildXlsx(d).arrayBuffer())), data);
    await page.setInputFiles('#svcFile', { name: 's.xlsx', mimeType: 'application/octet-stream', buffer: Buffer.from(bytes) });
    await expect(page.locator('#svcMonth')).toBeVisible();
  }
  test('summary table: people served per month and unit, forgot-sign-out rows counted, decisions listed', async ({ page }) => {
    await importRows(page, SAMPLE);
    await expect(page.locator('#svcMonth option')).toHaveText(['2026-09', '2026-10']);
    await expect(page.locator('#svcMonth')).toHaveValue('2026-10');                       // 預設最新月份
    const units = page.locator('#svcUnits tbody tr');
    await expect(units.filter({ hasText: '機構一' })).toContainText('2');                 // 10 月機構一：T-002、T-003
    await expect(units.filter({ hasText: '機構二' })).toContainText('1');
    await expect(units.filter({ hasText: '合計' })).toContainText('2');                   // 當月不重複人數 = 2（T-002 只算一次）
    await expect(units.filter({ hasText: '合計' })).toContainText('3.0');                 // (90+30+60) 分 = 3.0 小時：忘簽退與服務未遇都計入
    await page.selectOption('#svcMonth', '2026-09');
    await expect(page.locator('#svcUnits tbody tr', { hasText: '合計' })).toContainText('1.0');
    await expect(page.locator('#svcDecided')).toContainText('不區分結案或暫停');
    await expect(page.locator('#svcDecided')).toContainText('先計入居服員工時');
    await expect(page.locator('#svcDecided')).toContainText('姓名後加「2」');
    await expect(page.locator('#view')).toContainText('第一版以居家服務為主');
  });
  test('a name ending in the digit 2 is flagged as a same-name case for a person to check', async ({ page }) => {
    await importRows(page, SAMPLE);
    await expect(page.locator('#view tbody tr', { hasText: '測試員甲2' })).toContainText('同名同姓');
  });
});

test.describe('10/20 permissions: system admin read-only, HR and manager scopes, org chart editing', () => {
  test('system admin can view but not edit employees; HR and manager can', async ({ page }) => {
    await openPortal(page);
    await go(page, 'hr', 'emp');
    await expect(page.locator('[data-newemp]')).toBeDisabled();                       // 系統管理員：可檢視，不可修改
    await setRole(page, 'hr');
    await go(page, 'hr', 'emp');
    await expect(page.locator('[data-newemp]')).toBeEnabled();
    await setRole(page, 'manager');
    await go(page, 'hr', 'emp');
    await expect(page.locator('[data-newemp]')).toBeEnabled();                        // 管理者：幾乎全部可修改
  });
  test('manager sees everyone’s pay but cannot change payroll', async ({ page }) => {
    await openPortal(page);
    await setRole(page, 'manager');
    await go(page, 'hr', 'emp');
    await expect(empRows(page).first()).toContainText('NT$');
    expect(await page.evaluate(() => payEdit())).toBe(false);
    await go(page, 'pay', 'run');
    await expect(page.locator('#view')).toContainText('可檢視');
    await setRole(page, 'boss');
    expect(await page.evaluate(() => payEdit())).toBe(false);                          // 老闆也只能檢視
  });
  test('HR cannot change permissions but can approve and finalise leave', async ({ page }) => {
    await openPortal(page);
    await setRole(page, 'hr');
    const caps = await page.evaluate(() => ({ perms: can('perms'), approve: can('approve'), finalize: can('finalize'), ann: can('annGroup') }));
    expect(caps).toEqual({ perms: false, approve: true, finalize: true, ann: true });
    const sys = await page.evaluate(() => can('perms'));
    expect(sys).toBe(false);
  });

  test('only the manager and system admin can add or remove people on the org chart', async ({ page }) => {
    await openPortal(page);
    for (const role of ['hr', 'daydir', 'employee']) {
      await setRole(page, role);
      await go(page, 'perm', 'orgfn');
      await expect(page.locator('[data-orgedit-toggle]')).toHaveCount(0);
      await expect(page.locator('#view')).toContainText('只有管理者與系統管理員可以增減組織圖');
    }
    for (const role of ['admin', 'manager']) {
      await setRole(page, role);
      await go(page, 'perm', 'orgfn');
      await page.click('[data-orgedit-toggle]');
      await expect(page.locator('#orgAddForm')).toBeVisible();
      const before = await page.locator('.leaf').count();
      await page.selectOption('#orgAddForm [name="unit"]', 'O1');
      await page.selectOption('#orgAddForm [name="dept"]', 'day');
      await page.fill('#orgAddForm [name="label"]', '示範人員 · 照服員');
      await page.click('#orgAddForm button[type="submit"]');
      await expect(page.locator('input.leaf[data-orgedit^="X"]')).toHaveCount(1);        // 新增的在編輯模式是輸入框
      await page.locator('input.leaf[data-orgedit^="X"]').locator('xpath=following-sibling::button').click();
      await expect(page.locator('input.leaf[data-orgedit^="X"]')).toHaveCount(0);        // 刪除剛加的
      const first = page.locator('button.orgdel[data-orgdel]').first();
      const id = await first.getAttribute('data-orgdel');
      await first.click();
      await expect(page.locator(`[data-orgedit="${id}"]`)).toHaveCount(0);               // 從圖上移除（不是刪員工資料）
      expect(await page.evaluate(i => !!STAFF.find(s => s.id === i), id)).toBe(true);
      await page.click('[data-orgedit-toggle]');
      expect(await page.locator('.leaf').count()).toBeLessThan(before + 1);
      await page.evaluate(() => { state.orgHidden = []; state.orgExtra = []; state.orgEditMode = false; });
    }
  });
  test('the added person shows on the chart for everyone and is marked as a position only', async ({ page }) => {
    await openPortal(page);
    await go(page, 'perm', 'orgfn');
    await page.click('[data-orgedit-toggle]');
    await page.fill('#orgAddForm [name="label"]', '新增示範 · 司機');
    await page.click('#orgAddForm button[type="submit"]');
    await page.click('[data-orgedit-toggle]');
    await expect(page.locator('.leaf.extra', { hasText: '新增示範 · 司機' })).toBeVisible();
    await setRole(page, 'hr');
    await go(page, 'perm', 'orgfn');
    await expect(page.locator('.leaf.extra', { hasText: '新增示範 · 司機' })).toBeVisible();
  });

  test('permission matrix edit: cancel restores, save keeps', async ({ page }) => {
    await openPortal(page);
    await go(page, 'perm', 'matrix');
    await editPerms(page);
    await page.click('[data-perm="daydir|approve"]');
    await expect(page.locator('[data-perm="daydir|approve"]')).toContainText('不可');
    await page.click('[data-perm-cancel]');
    await editPerms(page);
    await expect(page.locator('[data-perm="daydir|approve"]')).toContainText('可');          // 取消後回到原本
    await page.click('[data-perm="daydir|approve"]');
    await page.click('[data-perm-save]');
    await editPerms(page);
    await expect(page.locator('[data-perm="daydir|approve"]')).toContainText('不可');        // 儲存後保留
    await page.click('[data-perm-cancel]');
  });
});

test.describe('10/20 payroll categories', () => {
  test('three pay categories: monthly staff, hourly home care workers (full and part time), drivers with monthly plus hourly', async ({ page }) => {
    await openPortal(page);
    await setRole(page, 'hr');
    const basis = await page.evaluate(() => ({
      staff: payBasis(person('A004')), hcaFull: payBasis(person('A010')), hcaPart: payBasis(person('C003')), driver: payBasis(person('A008')),
      hcaFullType: person('A010').type }));
    expect(basis).toEqual({ staff: 'monthly', hcaFull: 'hourly', hcaPart: 'hourly', driver: 'driver', hcaFullType: 'full' });
    const r = await page.evaluate(() => { const d = calcPay('B007', '2026-09'), h = calcPay('A010', '2026-09'); return {
      driverBase: d.base, driverHome: d.home, driverHasHomeLine: d.lines.some(l => /居服時薪收入/.test(l.zh)), grossAddsUp: d.gross >= d.base + d.home - d.att,
      hcaBaseLine: h.lines.find(l => l.g === 'earn').zh }; });
    expect(r.driverBase).toBe(34000);                                   // 開車：固定月薪（不分大小月）
    expect(r.driverHome).toBeGreaterThan(0);
    expect(r.driverHasHomeLine).toBe(true);                             // 居服部分另列時薪收入
    expect(r.hcaBaseLine).toBe('正常工時薪資');                          // 全職居服員也走時薪制
    await go(page, 'pay', 'run');
    const card = page.locator('#payRules');
    for (const s of ['一般員工', '居服員（全職與兼職）', '日照司機（雙重角色）', '不分大小月', '約 20 種項目', '單價跟隨政府支付碼', '附設新竹縣私立誠馨綜合式服務類長期照顧服務機構', '附設新竹市私立誠芯居家長照機構', '附設私立誠芯三館綜合長照機構', '正式格式待提供']) await expect(card).toContainText(s);
    await expect(page.locator('#view tbody tr', { hasText: 'A008' })).toContainText('月薪＋居服時薪');
    await expect(page.locator('#view tbody tr', { hasText: 'A010' })).toContainText('時薪');
  });
  test('calculator: the driver’s home-care hours and rate add a separate hourly line', async ({ page }) => {
    await openPortal(page);
    await setRole(page, 'hr');
    await go(page, 'pay', 'calc');
    await page.selectOption('#calcForm [name="empId"]', 'B007');
    await expect(page.locator('#calcForm [name="homeH"]')).toBeVisible();
    await page.fill('#calcForm [name="homeH"]', '10');
    await page.fill('#calcForm [name="homeRate"]', '220');
    await expect(page.locator('#calcOut')).toContainText('居服時薪收入');
    await expect(page.locator('#calcOut')).toContainText('10');
  });
});


test.describe('10/20 shifts and punch location (portal)', () => {
  test('HR defines shifts: three built-in shifts, validation, add and delete a custom one', async ({ page }) => {
    await openPortal(page);
    await setRole(page, 'hr');
    await go(page, 'hr', 'att');
    const card = page.locator('#shiftCard');
    await expect(card.locator('tbody tr')).toHaveCount(3);
    await expect(card).toContainText('08:00–17:00');
    await expect(card).toContainText('07:45–16:45');
    await expect(card).toContainText('共九小時，每月輪替');
    await expect(card).toContainText('早上兩小時＋下午兩小時');
    await page.fill('#shiftForm [name="zh"]', '晚班');
    await page.fill('#shiftForm [name="s1"]', '17:00'); await page.fill('#shiftForm [name="e1"]', '16:00');
    await page.click('#shiftForm button[type="submit"]');
    await expect(page.locator('#shiftErr')).toContainText('結束時間要晚於開始時間');
    await page.fill('#shiftForm [name="e1"]', '21:00');
    await page.fill('#shiftForm [name="s2"]', '22:00');                                  // 第二段只填一半
    await page.click('#shiftForm button[type="submit"]');
    await expect(page.locator('#shiftErr')).toContainText('第二段');
    await page.fill('#shiftForm [name="s2"]', '');
    await page.click('#shiftForm button[type="submit"]');
    await expect(card.locator('tbody tr')).toHaveCount(4);
    await expect(card).toContainText('17:00–21:00');
    await page.locator('[data-shiftdel]').first().click();
    await expect(card.locator('tbody tr')).toHaveCount(3);
    await expect(card.locator('[data-shiftdel]')).toHaveCount(0);                         // 內建三種不能刪
  });
  test('shift settings: manager can edit, system admin and day-care supervisor only view', async ({ page }) => {
    await openPortal(page);
    await setRole(page, 'manager');
    await go(page, 'hr', 'att');
    await expect(page.locator('#shiftForm')).toBeVisible();
    await setRole(page, 'admin');
    await go(page, 'hr', 'att');
    await expect(page.locator('#shiftCard')).toBeVisible();
    await expect(page.locator('#shiftForm')).toHaveCount(0);
    await expect(page.locator('#shiftCard')).toContainText('只有人資與管理者可以新增或刪除班別');
  });
  test('punch location (IP) is back office only: shown to HR, manager and admin, never to others, all fictional', async ({ page }) => {
    await openPortal(page);
    for (const role of ['hr', 'manager', 'admin']) {
      await setRole(page, role);
      await go(page, 'hr', 'att');
      const card = page.locator('#punchLoc');
      await expect(card).toBeVisible();
      await expect(card).toContainText('只有後台看得到');
      await expect(card).toContainText('保存五年');
      await expect(card).toContainText('不強制拍照');
      const ips = await card.locator('td.mono').allInnerTexts();
      const addrs = ips.filter(v => /^\d+\.\d+\.\d+\.\d+$/.test(v));
      expect(addrs.length).toBeGreaterThan(0);
      expect(addrs.every(v => /^(203\.0\.113|198\.51\.100)\./.test(v))).toBe(true);     // 文件保留網段，不是真實 IP
    }
    await setRole(page, 'daydir');
    await go(page, 'hr', 'att');
    await expect(page.locator('#punchLoc')).toHaveCount(0);
  });
});

test.describe('10/20 phone clock-in: shifts, offline, no location on the phone', () => {
  const M = 'file://' + path.resolve(__dirname, '../mobile.html');
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });
  test('the shift list matches the meeting: normal, special (07:45–16:45), driver (two segments)', async ({ page }) => {
    await page.goto(M);
    await expect(page.locator('#shiftSel option')).toHaveText(['一般班', '特殊班（日照照服員）', '司機班']);
    await expect(page.locator('#view')).toContainText('08:00–17:00');
    await page.selectOption('#shiftSel', 'special');
    await expect(page.locator('#view')).toContainText('07:45–16:45');
    await expect(page.locator('#view')).toContainText('每月輪替');
    await page.selectOption('#shiftSel', 'driver');
    await expect(page.locator('#view')).toContainText('早上兩小時＋下午兩小時，共四小時');
  });
  test('driver shift has two segments: four punches in a day', async ({ page }) => {
    await page.goto(M);
    await page.selectOption('#shiftSel', 'driver');
    for (const label of ['上班打卡', '下班打卡', '上班打卡', '下班打卡']) {
      await expect(page.locator('#punchBtn')).toContainText(label);
      await page.click('#punchBtn');
    }
    await expect(page.locator('.punch[disabled]')).toContainText('今日已完成');
    await expect(page.locator('#view')).toContainText('第 2 段 下班');
  });
  test('late is judged by the shift start: 07:50 is late on the special shift but on time on the normal shift', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-10-21T07:50:00') });
    await page.goto(M);
    await page.click('#punchBtn');
    await expect(page.locator('#view .chip.ok', { hasText: '準時' })).toBeVisible();      // 一般班 08:00
    await page.click('#undoPunch');
    await page.selectOption('#shiftSel', 'special');                                       // 特殊班 07:45
    await page.click('#punchBtn');
    await expect(page.locator('#view .chip.warn', { hasText: '遲到' })).toBeVisible();
  });
  test('offline punches are kept on the phone and uploaded automatically when the network returns', async ({ page }) => {
    await page.goto(M);
    await page.context().setOffline(true);
    await expect(page.locator('#net')).toContainText('目前沒有網路');
    await page.click('#punchBtn');
    await expect(page.locator('.toast')).toContainText('連上網路後自動上傳');
    await expect(page.locator('#view .chip.warn', { hasText: '待上傳' })).toBeVisible();
    await page.reload().catch(() => {});                                                  // 離線重開：資料還在
    await page.context().setOffline(false);
    await page.goto(M);
    await expect(page.locator('#view .chip.warn', { hasText: '待上傳' })).toHaveCount(0);    // 連上網路後自動上傳
    await expect(page.locator('#view')).toContainText(/\d{2}:\d{2}/);
  });
  test('old saved punches (single in/out) still load', async ({ page }) => {
    await page.addInitScript(() => { try { const d = new Date(), k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (!localStorage.getItem('zx-m-state-v1')) localStorage.setItem('zx-m-state-v1', JSON.stringify({ punches: { [k]: { in: '07:55' } }, ot: [], fix: [], leave: [] })); } catch (e) {} });
    await page.goto(M);
    await expect(page.locator('#punchBtn')).toContainText('下班打卡');
    await expect(page.locator('#view')).toContainText('07:55');
  });
  test('the phone shows no IP address or place name anywhere', async ({ page }) => {
    await page.goto(M);
    await page.click('#punchBtn');
    for (const t of ['punch', 'hours', 'leave', 'cal']) {
      await page.click(`[data-tab="${t}"]`);
      const text = await page.locator('#view').innerText();
      expect(text).not.toMatch(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/);
      expect(text).not.toMatch(/📍/);
    }
  });
});

/* ================================================================ */
test.describe('Course credits: only the training officer edits (10/20)', () => {
  test.beforeEach(async ({ page }) => { await openPortal(page); });
  const gotoCourse = async (page, role) => {
    await setRole(page, role);
    await page.evaluate(() => { state.module = 'desk'; state.tab = 'course'; state.ceView = 'all'; state.ceEmp = null; render(); });
  };

  test('training officer sees the import box; HR and admin do not', async ({ page }) => {
    await gotoCourse(page, 'training');
    await expect(page.locator('#ceFile')).toHaveCount(1);
    for (const r of ['hr', 'admin']) {
      await gotoCourse(page, r);
      await expect(page.locator('#ceFile')).toHaveCount(0);
    }
  });

  test('import rows: add, skip duplicates, report errors, ROC dates', async ({ page }) => {
    const res = await page.evaluate(() => {
      const id = ceEligibleStaff()[0].id;
      const head = ['員工編號', '課程日期', '課程名稱', '實施方式', '開課單位', '專業課程', '專業品質', '專業倫理', '專業法規', '消防安全', '緊急應變', '感染管制', '性別敏感度', '原住民族文化', '多元族群文化'];
      const v = [1, 0, 0, 0, 0, 0, 0, 0, 0, 0];
      const rows = [head,
        [id, '115/03/12', '測試課程甲', '實體', '單位', ...v],
        [id, '115/03/12', '測試課程甲', '實體', '單位', ...v],
        ['ZZZ999', '2026-03-12', '測試課程乙', '實體', '單位', ...v],
        [id, '壞日期', '測試課程丙', '實體', '單位', ...v],
        [id, '2026-03-13', '測試課程丁', '面對面', '單位', ...v]];
      const out = ceImportRows(rows);
      const rec = ceRecord(id).courses.filter(c => c.name === '測試課程甲');
      return { added: out.added, dup: out.dup, errs: out.errors.length, date: rec[0] && rec[0].date, n: rec.length };
    });
    expect(res).toEqual({ added: 1, dup: 1, errs: 3, date: '2026-03-12', n: 1 });
  });

  test('import rows: missing header is a fatal message', async ({ page }) => {
    const out = await page.evaluate(() => ceImportRows([['a', 'b'], [1, 2]]));
    expect(out.fatal).toBeTruthy();
  });
});

test.describe('Owner can edit the permission table (21 Oct notes)', () => {
  test('owner sees the Edit button and HR does not', async ({ page }) => {
    await openPortal(page);
    await setRole(page, 'boss');
    await go(page, 'perm', 'matrix');
    await expect(page.locator('[data-perm-edit]')).toBeVisible();
    await setRole(page, 'hr');
    await go(page, 'perm', 'matrix');
    await expect(page.locator('[data-perm-edit]')).toHaveCount(0);
  });
});

test.describe('仁寶 dashboard, first version (22 Oct)', () => {
  const HEAD = ['案號', '服務項目類別', '項目服務次數', '居服員姓名', '服務日期', '服務時間長度(分)', '服務單位', '服務狀態', '是否遲到'];
  const ROWS = [HEAD,
    ['T-001', '陪伴服務', '1', '測試員甲', '2026-10-01', '60', '機構一', '已簽退', '否'],
    ['T-002', '陪伴服務', '1', '測試員乙', '2026-10-02', '90', '機構一', '忘簽退', '是'],
    ['T-002', '協助沐浴及洗頭', '1', '測試員乙', '2026-10-03', '30', '機構一', '服務未遇(新制)', '否'],
    ['T-003', '陪伴服務', '1', '測試員甲2', '2026-10-04', '0', '機構一', '已簽退', '否']];
  test('tiles, charts and exception counts from the import, with a partial-month warning', async ({ page }) => {
    await openPortal(page);
    await go(page, 'svc', 'case');
    const csv = '\ufeff' + ROWS.map(r => r.join(',')).join('\r\n') + '\r\n';
    await page.setInputFiles('#svcFile', { name: 'oct.csv', mimeType: 'text/csv', buffer: Buffer.from(csv, 'utf8') });
    const d = page.locator('#svcDash');
    await expect(d).toContainText('居家服務儀表板（第一版）');
    await expect(d).toContainText('3');                                  // 服務人數
    await expect(d).toContainText('3.0');                                // (60+90+30+0) 分 = 3.0 小時
    await expect(d).toContainText('忘簽退：1');
    await expect(d).toContainText('服務未遇：1');
    await expect(d).toContainText('遲到：1');
    await expect(d).toContainText('服務時間為 0：1');
    await expect(d).toContainText('不是整個月');                            // 資料只到 10/4
    await expect(d).not.toContainText('測試員');                          // 儀表板不顯示姓名
  });
});

test.describe('Payroll: 仁寶 hours and the revenue-share draft (22 Oct)', () => {
  const csvOf = rows => '\ufeff' + rows.map(r => r.join(',')).join('\r\n') + '\r\n';
  const importCsv = async (page, rows) => {
    await go(page, 'svc', 'case');
    await page.setInputFiles('#svcFile', { name: 'oct.csv', mimeType: 'text/csv', buffer: Buffer.from(csvOf(rows), 'utf8') });
    await expect(page.locator('#svcDash')).toBeVisible();
  };
  const HEAD = ['案號', '服務項目類別', '項目服務次數', '居服員姓名', '服務日期', '服務時間長度(分)', '項目單價'];

  test('revenue-share draft: unit price x count x ratio, default and per-item ratios', async ({ page }) => {
    await openPortal(page);
    await importCsv(page, [HEAD,
      ['T-1', '陪伴服務', '1', '測試員甲', '2026-10-05', '60', '175'],
      ['T-2', '陪伴服務', '2', '測試員甲', '2026-10-06', '60', '175'],
      ['T-3', '協助沐浴及洗頭', '1', '測試員乙', '2026-10-07', '30', '325']]);
    await go(page, 'pay', 'calc');
    const card = page.locator('#paySplit');
    await expect(card).toContainText('申報金額合計：NT$850');
    await expect(card).toContainText('拆帳金額合計：NT$510');                     // 850 × 60%
    await card.locator('#splitRatio').fill('50');
    await card.locator('#splitRatio').dispatchEvent('change');
    await expect(page.locator('#paySplit')).toContainText('拆帳金額合計：NT$425');
    const it = page.locator('#paySplit [data-splititem="陪伴服務"]');
    await it.fill('100');
    await it.dispatchEvent('change');
    await expect(page.locator('#paySplit')).toContainText('拆帳金額合計：NT$688');   // 525×100% + 325×50% = 687.5，四捨五入
    await expect(page.locator('#paySplit')).toContainText('草稿');
  });

  test('the draft exports to Excel with the current ratios', async ({ page }) => {
    await openPortal(page);
    await importCsv(page, [HEAD, ['T-1', '陪伴服務', '2', '測試員甲', '2026-10-05', '60', '175']]);
    await go(page, 'pay', 'calc');
    await page.locator('#splitRatio').fill('50');
    await page.locator('#splitRatio').dispatchEvent('change');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#splitXlsx')]);
    expect(dl.suggestedFilename()).toBe('拆帳制草稿_2026-10.xlsx');
    const buf = fs.readFileSync(await dl.path());
    expect(buf.subarray(0, 2).toString()).toBe('PK');
    const text = buf.toString('utf8');
    for (const s of ['拆帳制草稿（2026-10）', '草稿：分帳比例是假設（預設 50%）', '陪伴服務', '測試員甲', '350', '175']) expect(text).toContain(s);   // 175×2 = 350，50% = 175
  });

  test('without an import the draft asks for the 仁寶 file', async ({ page }) => {
    await openPortal(page);
    await go(page, 'pay', 'calc');
    await expect(page.locator('#paySplit')).toContainText('先到「業務資料整合');
  });

  test('imported 仁寶 hours replace the demo hours for a matching hourly worker', async ({ page }) => {
    await openPortal(page);
    const name = await page.evaluate(() => person('A007').zh);
    const before = await page.evaluate(() => payInputs('A007', '2026-10').regH);
    await importCsv(page, [HEAD, ['T-1', '陪伴服務', '1', name, '2026-10-05', '150', '175']]);
    const after = await page.evaluate(() => { const i = payInputs('A007', '2026-10'); return { h: i.regH, src: i.sources.includes('仁寶') }; });
    expect(after).toEqual({ h: 2.5, src: true });                              // 150 分鐘 = 2.5 小時
    expect(before).not.toBe(2.5);
  });
});

test.describe('Leave types from the 104 setting (27 Oct)', () => {
  test('new leave types, grouped caps, and designated-staff types hidden', async ({ page }) => {
    await openPortal(page);
    const r = await page.evaluate(() => {
      const bal = leaveBalance('H005'), keys = bal.map(b => b.k);
      return { keys, hasInd: keys.includes('indigenous'), hasCo: keys.includes('companyPersonal'),
        types: ['bereave1', 'bereave2', 'bereave3', 'maternity', 'prenatal', 'paternity', 'injury', 'disaster'].every(k => keys.includes(k)),
        grp: LEAVE_GROUPS.persgrp.h, sickgrp: LEAVE_GROUPS.sickgrp.h };
    });
    expect(r.types).toBe(true);
    expect(r.hasInd || r.hasCo).toBe(false);
    expect([r.grp, r.sickgrp]).toEqual([112, 264]);
  });
  test('the leave form lists the new types', async ({ page }) => {
    await openPortal(page);
    await go(page, 'desk', 'forms');
    await page.click('[data-dform="leave"]');
    const opts = await page.locator('#leaveForm select[name="type"] option').allTextContents();
    for (const s of ['一類喪假（8 日）', '產假（女）', '陪產檢及陪產假（男）', '公傷病假', '天災停班']) expect(opts.join('|')).toContain(s);
  });
});
