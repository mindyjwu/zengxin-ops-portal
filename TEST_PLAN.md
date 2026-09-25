# 康禾長照集團 Ops Portal — Role-Based Testing Plan

Manual test plan for `ltc-portal.html`. Each check names the automated test in
`__tests__/portal.e2e.test.js` that covers it, if one exists. Checks marked
**manual** have no automated coverage yet.

Run the automated suite with `npm run test:e2e`. If your machine's Chromium
build doesn't match the one Playwright expects, point `PW_CHROMIUM_PATH` at it
(see `playwright.config.js`), and set `LANG=C.UTF-8` so Chinese download
filenames come through.

## Test Objectives
Verify that the three built roles correctly restrict or allow:
- Sensitive employee data (pay, bank account, national ID, contact details, insurance)
- Cross-facility data visibility (data scope)
- Leave, overtime and missed-punch approvals
- Payroll and CSV exports

---

## Test Data

The prototype has no login and no database. All data is fictional and lives in
browser memory, so **reloading the page resets everything**. The demo date is
fixed at **2026-09-08**.

| Unit | ID | Staff |
|------|----|-------|
| 新竹營運中心 (HQ) | HQ | 6 (E1001–E1006) |
| 竹北照護院 | O1 | 8 (E2101–E2108) |
| 竹東照護院 | O2 | 9 (E2201–E2209) |
| **Total** | | **23** |

---

## Roles & Permissions Matrix

Switch roles with the **身分 / Role** selector (`#roleSel`) at the top of every page.

| | 系統管理員 System Admin (`admin`) | 人資部經理 HR Manager (`hr`) | 院長 Facility Director (`manager`) |
|---|---|---|---|
| Persona | E1005, HQ | E1003, HQ | E2101, director of O1 |
| Data scope | All facilities | All facilities | O1 only (all if the assumption toggle is ON) |
| See pay, band, bank account | ❌ | ✅ | ❌ |
| Full national ID | ❌ (masked, last 3 shown) | ✅ | ❌ (masked) |
| Contact details (mobile, address, emergency) | ✅ | ✅ | ❌ |
| Edit personnel file | ✅ | ✅ | ❌ |
| Add performance appraisal | ✅ | ✅ | ✅ |
| Approve leave / overtime / punch fixes | ❌ | ✅ | ✅ |
| HR countersign (final approval) | ❌ | ✅ | ❌ |
| Post announcements | Group-wide | Group-wide | Own facility only |
| Payroll module | Hidden | ✅ | Hidden |
| Settings (系統設定) | ✅ | Hidden | Hidden |
| Permission matrix (權限與範圍) | Full matrix, editable | Own column, read-only | Own column, read-only |
| Payroll (financial) CSV export | ❌ | ✅ | ❌ |
| Other CSV exports | ✅ (all facilities) | ✅ (all facilities) | ✅ (O1 only) |

The **假設 / Assumption: 主管可跨院查看** button (`#assumeBtn`) is a discussion
toggle: when it is ON, the manager reads all facilities. In every role, nobody
can approve their own request.

Six more roles (COO, Finance, Nursing, Care, Social Work, Company Manager) are
defined as Phase 2–3 stubs and don't appear in the role selector.

---

## Testing Procedure

### Phase 1: Shell & Data Scope

#### Test 1.1: Shell
- [ ] The page loads with 康禾長照集團 branding, as `admin` — *Shell & role switching › loads with brand…*
- [ ] The role selector offers only admin, hr and manager — *…role selector offers only the built roles*
- [ ] The **目前視角 / Viewing as** chip changes with the role — *…switching role updates the persona chip*
- [ ] HR shows four tabs: 員工資料, 我的工時, 出勤管理, 請假審核 — *…HR module exposes its four tabs*

#### Test 1.1b: Settings & permission matrix
- [ ] 系統設定 is in the nav for admin only — *Settings & permission matrix › settings is in the nav for admin only*
- [ ] Switching to hr while on 系統設定 returns to 原型說明 — *…switching away from admin while on settings…*
- [ ] admin sees all three role columns with 24 editable checkboxes (the payroll row follows 查看薪資); admin's own 管理角色與權限 box is disabled — *…admin sees the full matrix…*
- [ ] hr and manager see only their own column, read-only, and can still open 待決議題 — *…sees only their own column…*
- [ ] Granting manager 查看薪資 makes pay and Payroll appear for manager; 還原預設 removes them again — *…a change made by admin takes effect…*

#### Test 1.2: Data scope (HR › 員工資料)
- [ ] admin and hr see all 23 employees — *Data scope › admin and hr see all 23 employees*
- [ ] manager sees only the 8 O1 staff; the office filter is disabled; a note says 15 records are hidden — *…manager sees only O1 staff…*
- [ ] With the assumption toggle ON, manager sees all 23 and the filter is enabled — *…assumption toggle opens the manager…*
- [ ] admin filtering to 竹東照護院 shows 9 employees — *…office filter narrows admin…*
- [ ] manager's 出勤管理 and 請假審核 show only O1 — *…manager attendance and leave views are limited to O1*

#### Test 1.3: Announcements, org chart, directory (公告欄)
- [ ] Board: admin sees all 9 posts; manager sees 8 (group-wide plus O1) — **manual**
- [ ] Board: admin and hr get **發布公告** (group post); manager gets **發布本院公告** (facility post) — **manual**
- [ ] Org chart: every role sees the full structure; for manager, other facilities collapse to "N 位同仁（不在範圍內）" — **manual**
- [ ] Directory: manager sees 8 / 23, with mobile numbers locked (僅人資／管理員) — **manual**

---

### Phase 2: Salary Visibility & Personnel File

#### Test 2.1: Employee table (HR › 員工資料)
- [ ] hr sees 月薪 amounts (E2103 = NT$58,000) — *Salary visibility › hr sees monthly pay*
- [ ] admin and manager see 🔒 僅人資可見 and no NT$ amounts — *…admin / manager sees the lock instead of pay*

#### Test 2.2: Personnel-file drawer (click an employee row)
The drawer has six sections: 概要, 基本與金融資料, 任職與薪資歷程, 勞健保資料, 資格與契約, 績效與文件.
- [ ] Every section opens and the drawer closes with ✕ — *Personnel file drawer › every section renders…*
- [ ] **hr:** full national ID, pay, bank account, pay history and insurance grades are shown — *…hr sees full ID, pay…*
- [ ] **admin:** national ID masked (•••, last 3 shown), contact details shown, bank account locked, pay-history bands shown as •••, insurance premiums locked — *…admin gets contact details but masked ID…*
- [ ] **manager:** mobile and address restricted (受限); bank account locked — *…manager cannot see contact details or pay*
- [ ] **manager, out of scope:** opening an O2 person from the org chart shows the position only, a 不在您目前的資料範圍內 note, and no section buttons — *…manager opening an out-of-scope person…*
- [ ] **admin / hr:** 編輯 on 基本與金融資料 saves changes for this browser session — **manual**
- [ ] **manager:** no 編輯 button; 新增考核 is available under 績效與文件 — **manual**

---

### Phase 3: Leave Approval Workflow (HR › 請假審核)

Flow: **待主管簽核 (pending) → 待人資複核 (countersign) → 已核准 (approved)**, or 已駁回 (rejected).

- [ ] manager approves L241 → it moves to 待人資複核 and shows 🔒 待人資處理; hr countersigns → 已核准 — *Leave approval flow › pending → countersign → approved*
- [ ] manager rejects L242 → 已駁回 — *…reject ends the request*
- [ ] admin sees 🔒 無簽核權限 with no buttons — *…admin has no approval rights*
- [ ] hr files a leave request, then sees it locked as 本人申請 — *…an approver cannot sign their own request*
- [ ] Overtime and missed-punch requests go through the same approve / countersign steps — **manual**

---

### Phase 4: My Hours (HR › 我的工時)

Shifts: 白班 (day) 08:00–17:00 with a 12:00–13:00 lunch; 小夜 (evening) 16:00–00:00 and
大夜 (overnight) 00:00–08:00, 8 h straight with no lunch deduction. Only nurses and care attendants
at O1 and O2 rotate; HQ staff and every other title always work day shifts. 1 day = 8 h; minimum
leave unit 0.5 h.

- [ ] Clock in at 08:00 and out at 17:30 → today's row shows 白班 and 8.5 h — *My Hours › clock in and out…*
- [ ] Clocking in and out in the same minute shows no hours (—), not 24 h — *…clocking in and out in the same minute counts 0 h…*
- [ ] Punch records show a 班別 column. None of the three built roles works rotating shifts, so My Hours always shows 白班 here; evening and overnight shifts are checked from Payroll in Phase 5 — **manual**
- [ ] Leave: the 上午 4h and 下午 4h quick picks each compute 4 h; submitting creates a pending request — *…half-day leave computes 4 h…*
- [ ] Overtime: 17:00–19:00 = 2 h, 17:00–20:30 = 3.5 h, 22:00–02:00 = 4 h (crosses midnight) — *…overtime hours compute…*
- [ ] Balance (admin, E1005): annual leave 120 h entitlement, 4 h used, 116 h left; comp time 4 h; a pending 4 h request leaves 112 h — *…balance tab reflects entitlement…*
- [ ] Overtime over the 46 h monthly cap is refused — **manual**
- [ ] 出勤異常 lists exceptions and links to 補打卡 or 補請假 — **manual**
- [ ] 工作日誌 entries appear in the attendance and personnel CSVs — **manual**

---

### Phase 5: Payroll (薪資計算, hr only)

- [ ] The Payroll module appears in the menu for hr only — **manual**
- [ ] Switching from hr to another role while on Payroll returns to 原型說明 — **manual**
- [ ] 薪資試算 excludes requests that aren't approved yet and says how many — **manual**
- [ ] Night-shift allowance: NT$200 per evening shift and NT$400 per overnight shift. For E2203 in 2026-08 (5 evening, 1 overnight), the breakdown shows NT$1,000 and NT$400, and the overtime hourly base becomes (58,500 + 1,400) ÷ 240 = 249.58 — *Payroll night-shift allowance › rotating nurse is paid per evening / overnight shift…*
- [ ] Day-shift staff (E1003) get no allowance lines — *…day-shift staff get no allowance*
- [ ] The calculator adds the allowance per shift, and the allowance can be excluded from the overtime base — *…calculator adds allowance per shift…*
- [ ] For a part-time worker the allowance is also in the overtime rate: (160 h × 200 + 1,600) ÷ 160 h = 210 per hour — *…calculator includes a part-timer's allowance in their OT rate*
- [ ] Leave is counted against the shift worked that day: on E2203's 2026-08-27 overnight shift, 00:00–08:00 or a full-day 08:00–17:00 request is 8 h; on the 2026-08-21 evening shift, 13:00–17:00 is 1 h — *…leave is counted against the evening or overnight shift…*
- [ ] Partial leave on an evening or overnight shift keeps that shift's allowance; only a full-shift leave removes it — *…partial leave on an overnight shift keeps the allowance*
- [ ] Open E2203's payslip for 2026-08: the 小夜 and 大夜 rows list the shift dates, and late minutes follow each shift's start time — **manual**
- [ ] The payroll CSV has 小夜班次, 大夜班次 and 夜班津貼 columns — **manual**
- [ ] A warning shows when the labor insured salary is below the bracket for regular pay including the allowance — **manual**
- [ ] 薪資計算機 shows the formula for every line — **manual**
- [ ] 版本與覆核: save version → submit → approve (locks the month) or return; unlock to recalculate — **manual**

---

### Phase 6: Reports Export (報表匯出)

- [ ] Attendance, personnel, leave and payroll CSVs download as `<報表名>_<月份>.csv` with a UTF-8 BOM and the expected header row — *CSV exports › … report downloads with a BOM and header*
- [ ] Changing the month changes the filename and the rows — *…month selector changes filename and content*
- [ ] Personnel CSV: 薪資 is 受限 for admin and numeric for hr — *…personnel report masks salary…*
- [ ] admin and manager see 🔒 僅人資可匯出薪資資料 instead of the payroll export — *…cannot export the payroll (financial) report*
- [ ] manager's exports contain only O1 staff — *…manager exports contain only O1 staff*
- [ ] An approval made in the session shows up in the leave CSV — *…leave report reflects an approval…*

---

### Phase 7: UI

- [ ] The 中文 / EN buttons switch the primary language; the other language stays as a secondary line — **manual**
- [ ] Layout is readable at 1920px, 768px and 375px widths — **manual**

---

### Phase 8: Cross-Role Scenario

1. As **admin**, file a half-day leave in 我的工時.
2. Switch to **hr**, open 請假審核, and approve it. (manager can't: the request is from HQ, outside O1.)
3. Still as **hr**, countersign it → 已核准.
4. Switch back to **admin** and check 假別餘額: the hours move from pending to used.
5. As **hr**, open Payroll, pick month 2026-09 (it defaults to 2026-08), and confirm the approved leave is counted.

This flow is **manual** end to end; its individual steps are covered by the tests above.

---

## Known Gaps & Open Questions

- [ ] **Open question:** should facility directors see other facilities? (the assumption toggle)
- [ ] **Open question:** must payroll calculation and review be done by different people?
- [ ] No persistence, login, notifications or audit trail: prototype only.

---

## Test Results Template

**Tester Name:** _______________
**Test Date:** _______________
**Browser:** _______________

### Summary
- Total Tests:
- Passed:
- Failed:
- Known Issues:

### Issues Found
| Role | Module | Feature | Expected | Actual | Severity |
|------|--------|---------|----------|--------|----------|
|      |        |         |          |        |          |
