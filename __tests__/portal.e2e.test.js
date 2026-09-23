/**
 * End-to-end UI tests for the 康禾長照集團 operations portal (ltc-portal.html).
 *
 * The page is a single-file prototype with in-memory data and a fixed demo
 * date of 2026-09-08. Built roles: admin (E1005, HQ), hr (E1003, HQ) and
 * manager (E2101, director of O1 竹北照護院).
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
    await expect(page.locator('.brand')).toContainText('康禾長照集團');
    await expect(page.locator('#roleSel')).toHaveValue('admin');
  });

  test('role selector offers only the built roles', async ({ page }) => {
    const values = await page.locator('#roleSel option').evaluateAll(os => os.map(o => o.value));
    expect(values).toEqual(['admin', 'hr', 'manager']);
  });

  test('switching role updates the persona chip', async ({ page }) => {
    const chip = page.locator('.pagehead .chip.acc');
    await setRole(page, 'hr');
    await expect(chip).toContainText('人資部經理');
    await setRole(page, 'manager');
    await expect(chip).toContainText('院長');
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
    await expect(page.locator('#view tbody')).not.toContainText('竹東照護院');
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
    await expect(page.locator('#view')).toContainText('竹北照護院');
    await expect(page.locator('#view')).not.toContainText('竹東照護院');

    await page.click('[data-tab="leave"]');
    await expect(requestRow(page, 'L241')).toHaveCount(1);   // E2103, O1
    await expect(requestRow(page, 'L245')).toHaveCount(0);   // E2203, O2
    await expect(requestRow(page, 'L234')).toHaveCount(0);   // E1005, HQ
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
    attendance: ['出勤統計報表', '員工編號,職稱,據點'],
    personnel: ['人事資料報表', '員工編號,姓名,職稱'],
    leave: ['差勤申請報表', '單號,類型,員工編號'],
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
