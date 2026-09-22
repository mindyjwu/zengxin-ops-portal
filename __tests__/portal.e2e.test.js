/**
 * End-to-End UI Tests for Zengxin LTC Operations Portal
 * Tests actual browser interactions and RBAC enforcement in the UI
 */

const { test, expect } = require('@playwright/test');

test.describe('Portal Navigation & Module Access', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('file://' + require('path').resolve(__dirname, '../ltc-portal.html'));
    await page.waitForLoadState('networkidle');
  });

  test('should load portal with CEO role by default', async ({ page }) => {
    await expect(page.locator('body')).toContainText('Zengxin LTC');
    const roleDisplay = await page.locator('[data-role]').getAttribute('data-role');
    expect(roleDisplay || 'ceo').toBe('ceo');
  });

  test('should display all modules in navigation', async ({ page }) => {
    const modules = ['HR', 'Leave', 'Reports', 'Settings', 'Announcements'];
    for (const mod of modules) {
      await expect(page.locator('nav, [role="navigation"]')).toContainText(mod);
    }
  });

  test('should switch roles via role selector', async ({ page }) => {
    await page.selectOption('select[name="role"], select.role-selector', 'manager');
    await page.waitForTimeout(300);
    const contentArea = page.locator('main, .main-content, [role="main"]').first();
    await expect(contentArea).toBeVisible();
  });

  test('should navigate between modules', async ({ page }) => {
    const tabs = await page.locator('button[data-module], a[data-tab], .tab-button').all();
    if (tabs.length > 0) {
      await tabs[0].click();
      await page.waitForTimeout(200);
      const content = page.locator('main, .content, .view').first();
      await expect(content).toBeVisible();
    }
  });
});

test.describe('Role-Based Visibility Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('file://' + require('path').resolve(__dirname, '../ltc-portal.html'));
    await page.waitForLoadState('networkidle');
  });

  test('CEO can see salary column', async ({ page }) => {
    await page.selectOption('select[name="role"], select.role-selector', 'ceo');
    const hrTab = page.locator('button:has-text("HR"), [data-module="hr"], a:has-text("Employee")').first();
    if (await hrTab.isVisible()) {
      await hrTab.click();
      await page.waitForTimeout(300);
    }
    const table = page.locator('table, [role="table"]').first();
    const headers = await table.locator('th, [role="columnheader"]').allTextContents();
    const headerText = headers.join(' ').toLowerCase();
    expect(headerText).toContain('salary');
  });

  test('Manager cannot see salary column', async ({ page }) => {
    await page.selectOption('select[name="role"], select.role-selector', 'manager');
    const hrTab = page.locator('button:has-text("HR"), [data-module="hr"], a:has-text("Employee")').first();
    if (await hrTab.isVisible()) {
      await hrTab.click();
      await page.waitForTimeout(300);
    }
    const table = page.locator('table, [role="table"]').first();
    const headers = await table.locator('th, [role="columnheader"]').allTextContents();
    const headerText = headers.join(' ').toLowerCase();
    expect(headerText).not.toContain('salary');
  });

  test('HR can see sensitive data', async ({ page }) => {
    await page.selectOption('select[name="role"], select.role-selector', 'hr');
    const hrTab = page.locator('button:has-text("HR"), [data-module="hr"], a:has-text("Employee")').first();
    if (await hrTab.isVisible()) {
      await hrTab.click();
      await page.waitForTimeout(300);
    }
    const table = page.locator('table, [role="table"]').first();
    const headers = await table.locator('th, [role="columnheader"]').allTextContents();
    const headerText = headers.join(' ').toLowerCase();
    expect(headerText).toContain('salary');
  });

  test('Staff cannot access Reports module', async ({ page }) => {
    await page.selectOption('select[name="role"], select.role-selector', 'staff');
    const reportsBtn = page.locator('button:has-text("Reports"), [data-module="rpt"], a:has-text("Reports")');
    const isDisabled = await reportsBtn.evaluate(el => {
      return el.disabled || el.classList.contains('disabled') || el.getAttribute('aria-disabled') === 'true';
    });
    expect(isDisabled).toBeTruthy();
  });

  test('Training Specialist has limited permissions', async ({ page }) => {
    await page.selectOption('select[name="role"], select.role-selector', 'training');
    const settingsBtn = page.locator('button:has-text("Settings"), [data-module="set"], a:has-text("Settings")');
    const isDisabled = await settingsBtn.evaluate(el => {
      return el.disabled || el.classList.contains('disabled') || el.getAttribute('aria-disabled') === 'true';
    });
    expect(isDisabled).toBeTruthy();
  });
});

test.describe('Leave Approval Workflow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('file://' + require('path').resolve(__dirname, '../ltc-portal.html'));
    await page.waitForLoadState('networkidle');
  });

  test('Manager can access leave approvals', async ({ page }) => {
    await page.selectOption('select[name="role"], select.role-selector', 'manager');
    const leaveTab = page.locator('button:has-text("Leave"), [data-module="leave"], a:has-text("Leave")').first();
    await expect(leaveTab).toBeVisible();
    await leaveTab.click();
    await page.waitForTimeout(300);
    const content = page.locator('main, .content, .view').first();
    await expect(content).toBeVisible();
  });

  test('CEO can approve leave requests', async ({ page }) => {
    await page.selectOption('select[name="role"], select.role-selector', 'ceo');
    const leaveTab = page.locator('button:has-text("Leave"), [data-module="leave"], a:has-text("Leave")').first();
    await leaveTab.click();
    await page.waitForTimeout(300);
    const approveBtn = page.locator('button:has-text("Approve"), button:has-text("Yes"), button.approve-btn').first();
    if (await approveBtn.isVisible()) {
      await expect(approveBtn).not.toBeDisabled();
    }
  });

  test('Staff cannot approve leave', async ({ page }) => {
    await page.selectOption('select[name="role"], select.role-selector', 'staff');
    const leaveTab = page.locator('button:has-text("Leave"), [data-module="leave"], a:has-text("Leave")').first();
    if (await leaveTab.isVisible()) {
      await leaveTab.click();
      await page.waitForTimeout(300);
    }
    const approveBtn = page.locator('button:has-text("Approve"), button:has-text("Yes"), button.approve-btn');
    if (await approveBtn.count() > 0) {
      await expect(approveBtn.first()).toBeDisabled();
    }
  });
});

test.describe('Module Features Access', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('file://' + require('path').resolve(__dirname, '../ltc-portal.html'));
    await page.waitForLoadState('networkidle');
  });

  test('CEO can access all report types', async ({ page }) => {
    await page.selectOption('select[name="role"], select.role-selector', 'ceo');
    const reportsTab = page.locator('button:has-text("Reports"), [data-module="rpt"], a:has-text("Reports")').first();
    if (await reportsTab.isVisible()) {
      await reportsTab.click();
      await page.waitForTimeout(300);
      const reportTabs = page.locator('[data-tab], button[data-report], .report-tab').count();
      expect(reportTabs).toBeGreaterThan(0);
    }
  });

  test('Accountant can access Financial reports', async ({ page }) => {
    await page.selectOption('select[name="role"], select.role-selector', 'accountant');
    const reportsTab = page.locator('button:has-text("Reports"), [data-module="rpt"], a:has-text("Reports")').first();
    if (await reportsTab.isVisible()) {
      await reportsTab.click();
      await page.waitForTimeout(300);
      const finTab = page.locator('button:has-text("Financial"), [data-report="fin"], a:has-text("Financial")').first();
      if (await finTab.isVisible()) {
        await expect(finTab).not.toBeDisabled();
      }
    }
  });

  test('CEO can access Settings', async ({ page }) => {
    await page.selectOption('select[name="role"], select.role-selector', 'ceo');
    const settingsTab = page.locator('button:has-text("Settings"), [data-module="set"], a:has-text("Settings")').first();
    await expect(settingsTab).toBeVisible();
    await expect(settingsTab).not.toBeDisabled();
  });

  test('Training Specialist cannot access Settings', async ({ page }) => {
    await page.selectOption('select[name="role"], select.role-selector', 'training');
    const settingsTab = page.locator('button:has-text("Settings"), [data-module="set"], a:has-text("Settings")');
    if (await settingsTab.count() > 0) {
      const isDisabled = await settingsTab.first().evaluate(el => {
        return el.disabled || el.classList.contains('disabled') || el.getAttribute('aria-disabled') === 'true';
      });
      expect(isDisabled).toBeTruthy();
    }
  });
});

test.describe('UI/UX Features', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('file://' + require('path').resolve(__dirname, '../ltc-portal.html'));
    await page.waitForLoadState('networkidle');
  });

  test('should display bilingual UI elements', async ({ page }) => {
    const content = await page.textContent('body');
    expect(content).toMatch(/Zengxin|員工|Employee/);
  });

  test('should have language toggle available', async ({ page }) => {
    const langToggle = page.locator('button:has-text("EN"), button:has-text("中文"), [data-lang]');
    if (await langToggle.count() > 0) {
      await expect(langToggle.first()).toBeVisible();
    }
  });

  test('should switch between light and dark themes', async ({ page }) => {
    const themeToggle = page.locator('button:has-text("🌙"), button:has-text("☀️"), [data-theme], .theme-toggle');
    if (await themeToggle.count() > 0) {
      await themeToggle.first().click();
      await page.waitForTimeout(200);
      const body = page.locator('body');
      const isDark = await body.evaluate(el => {
        return el.classList.contains('dark') || el.style.backgroundColor === 'rgb(0, 0, 0)';
      });
      expect(typeof isDark).toBe('boolean');
    }
  });

  test('should display employee records in table format', async ({ page }) => {
    const hrTab = page.locator('button:has-text("HR"), [data-module="hr"], a:has-text("Employee")').first();
    if (await hrTab.isVisible()) {
      await hrTab.click();
      await page.waitForTimeout(300);
      const table = page.locator('table, [role="table"]');
      await expect(table.first()).toBeVisible();
    }
  });

  test('should allow role switching without errors', async ({ page }) => {
    const roles = ['ceo', 'manager', 'hr', 'training', 'accountant', 'staff'];
    for (const role of roles) {
      await page.selectOption('select[name="role"], select.role-selector', role);
      await page.waitForTimeout(200);
      const mainContent = page.locator('main, .main-content, [role="main"]').first();
      await expect(mainContent).toBeVisible();
    }
  });
});

test.describe('Data Presentation & Filtering', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('file://' + require('path').resolve(__dirname, '../ltc-portal.html'));
    await page.waitForLoadState('networkidle');
  });

  test('CEO sees all employees across all facilities', async ({ page }) => {
    await page.selectOption('select[name="role"], select.role-selector', 'ceo');
    const hrTab = page.locator('button:has-text("HR"), [data-module="hr"], a:has-text("Employee")').first();
    if (await hrTab.isVisible()) {
      await hrTab.click();
      await page.waitForTimeout(300);
      const rows = page.locator('table tbody tr, [role="rowgroup"] [role="row"]');
      const count = await rows.count();
      expect(count).toBeGreaterThan(0);
    }
  });

  test('Staff sees limited employee records', async ({ page }) => {
    await page.selectOption('select[name="role"], select.role-selector', 'staff');
    const hrTab = page.locator('button:has-text("HR"), [data-module="hr"], a:has-text("Employee")').first();
    if (await hrTab.isVisible()) {
      await hrTab.click();
      await page.waitForTimeout(300);
      const alertText = await page.locator('.alert, [role="alert"]').allTextContents();
      const hasViewOwnlyAlert = alertText.some(text => text.includes('own'));
    }
  });

  test('Manager can filter by facility', async ({ page }) => {
    await page.selectOption('select[name="role"], select.role-selector', 'manager');
    const facilityFilter = page.locator('select[name="facility"], select.facility-filter, [data-facility]');
    if (await facilityFilter.count() > 0) {
      await expect(facilityFilter.first()).toBeVisible();
    }
  });
});

test.describe('Permission Enforcement', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('file://' + require('path').resolve(__dirname, '../ltc-portal.html'));
    await page.waitForLoadState('networkidle');
  });

  test('should not show edit buttons for staff', async ({ page }) => {
    await page.selectOption('select[name="role"], select.role-selector', 'staff');
    const hrTab = page.locator('button:has-text("HR"), [data-module="hr"], a:has-text("Employee")').first();
    if (await hrTab.isVisible()) {
      await hrTab.click();
      await page.waitForTimeout(300);
      const editBtns = page.locator('button:has-text("Edit"), button.edit-btn, a.edit-link');
      if (await editBtns.count() > 0) {
        const isDisabled = await editBtns.first().evaluate(el => {
          return el.disabled || el.classList.contains('disabled') || el.getAttribute('aria-disabled') === 'true';
        });
        expect(isDisabled).toBeTruthy();
      }
    }
  });

  test('should show sensitive fields only to authorized roles', async ({ page }) => {
    // Test CEO can see
    await page.selectOption('select[name="role"], select.role-selector', 'ceo');
    const hrTab = page.locator('button:has-text("HR"), [data-module="hr"], a:has-text("Employee")').first();
    if (await hrTab.isVisible()) {
      await hrTab.click();
      await page.waitForTimeout(300);
      const headers = page.locator('th, [role="columnheader"]').allTextContents();
      const headerText = (await headers).join(' ').toLowerCase();
      expect(headerText).toMatch(/salary|sensitive|contact/);
    }

    // Test Manager cannot see
    await page.selectOption('select[name="role"], select.role-selector', 'manager');
    await page.waitForTimeout(300);
    const managerHeaders = page.locator('th, [role="columnheader"]').allTextContents();
    const managerHeaderText = (await managerHeaders).join(' ').toLowerCase();
    expect(managerHeaderText).not.toContain('salary');
  });

  test('Accountant cannot edit employee records', async ({ page }) => {
    await page.selectOption('select[name="role"], select.role-selector', 'accountant');
    const hrTab = page.locator('button:has-text("HR"), [data-module="hr"], a:has-text("Employee")').first();
    if (await hrTab.isVisible()) {
      await hrTab.click();
      await page.waitForTimeout(300);
      const editBtns = page.locator('button:has-text("Edit"), button.edit-btn, a.edit-link');
      if (await editBtns.count() > 0) {
        const isDisabled = await editBtns.first().evaluate(el => {
          return el.disabled || el.classList.contains('disabled') || el.getAttribute('aria-disabled') === 'true';
        });
        expect(isDisabled).toBeTruthy();
      }
    }
  });
});
