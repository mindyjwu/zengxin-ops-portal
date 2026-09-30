# 誠馨日照 Ops Portal — Role-Based Testing Plan

Manual test plan for `ltc-portal.html`. Each check names the automated test in
`__tests__/portal.e2e.test.js` that covers it, if one exists. Checks marked
**manual** have no automated coverage yet.

Run the automated suite with `npm run test:e2e`. If your machine's Chromium
build doesn't match the one Playwright expects, point `PW_CHROMIUM_PATH` at it
(see `playwright.config.js`), and set `LANG=C.UTF-8` so Chinese download
filenames come through.

## Test Objectives
Verify that the four built roles correctly restrict or allow:
- Sensitive employee data (pay, bank account, national ID, contact details, insurance)
- Cross-facility data visibility (data scope)
- Leave, overtime and missed-punch approvals
- Payroll and CSV exports
- Employee self-service (私人秘書): own attendance, forms, payslips and nothing else

---

## Test Data

The prototype has no login and no database. All data is fictional and lives in
browser memory, so **reloading the page resets everything**. The demo date is
fixed at **2026-09-08**.

| Unit | ID | Staff |
|------|----|-------|
| 新竹營運中心 (HQ) | HQ | 6 (E1001–E1006) |
| 竹北日照中心 | O1 | 8 (E2101–E2108) |
| 竹東日照中心 | O2 | 9 (E2201–E2209) |
| **Total** | | **23** |

---

## Roles & Permissions Matrix

Switch roles with the **身分 / Role** selector (`#roleSel`) at the top of every page.

| | 系統管理員 System Admin (`admin`) | 人資部經理 HR Manager (`hr`) | 中心主任 Center Director (`manager`) | 一般員工 Employee (`employee`) |
|---|---|---|---|---|
| Persona | E1005, HQ | E1003, HQ | E2101, director of O1 | E2104, care attendant at O1 |
| Data scope | All facilities | All facilities | O1 only (all if the assumption toggle is ON) | Own records only; announcements and directory for O1 |
| 私人秘書 My Desk (own calendar, forms, payslips) | ✅ | ✅ | ✅ | ✅ (lands here) |
| Back office (人事、權限、文件、服務、財務、報表) | ✅ | ✅ | ✅ | Hidden |
| See pay, band, bank account | ❌ | ✅ | ❌ | Own payslip only |
| Full national ID | ❌ (masked, last 3 shown) | ✅ | ❌ (masked) | Own, masked |
| Contact details (mobile, address, emergency) | ✅ | ✅ | ❌ | Own only |
| Edit personnel file | ✅ | ✅ | ❌ | ❌ |
| Add performance appraisal | ✅ | ✅ | ✅ | ❌ |
| Approve leave / overtime / punch fixes / other forms | ❌ | ✅ | ✅ | ❌ |
| HR countersign (final approval) | ❌ | ✅ | ❌ | ❌ |
| Post announcements | Group-wide | Group-wide | Own facility only | ❌ |
| Payroll module | Hidden | ✅ | Hidden | Hidden |
| Settings (系統設定) | ✅ | Hidden | Hidden | Hidden |
| Permission matrix (權限與範圍) | Full matrix, editable | Own column, read-only | Own column, read-only | Hidden |
| Payroll (financial) CSV export | ❌ | ✅ | ❌ | ❌ |
| Other CSV exports | ✅ (all facilities) | ✅ (all facilities) | ✅ (O1 only) | ❌ |

The **假設 / Assumption: 主管可跨據點查看** button (`#assumeBtn`) is a discussion
toggle: when it is ON, the manager reads all facilities. It is hidden for the
employee role, whose scope never widens. In every role, nobody can approve their
own request.

Six more roles (COO, Finance, Nursing, Care, Social Work, Company Manager) are
defined as Phase 2–3 stubs and don't appear in the role selector.

---

## Testing Procedure

### Phase 1: Shell & Data Scope

#### Test 1.1: Shell
- [ ] The page loads with 誠馨日照 branding, as `admin` — *Shell & role switching › loads with brand…*
- [ ] The role selector offers only admin, hr, manager and employee — *…role selector offers only the built roles*
- [ ] The **目前視角 / Viewing as** chip changes with the role — *…switching role updates the persona chip*
- [ ] HR shows four tabs: 員工資料, 我的工時, 出勤管理, 請假審核 — *…HR module exposes its four tabs*

#### Test 1.1b: Settings & permission matrix
- [ ] 系統設定 is in the nav for admin only (not hr, manager or employee) — *Settings & permission matrix › settings is in the nav for admin only*
- [ ] Switching to hr while on 系統設定 returns to 原型說明 — *…switching away from admin while on settings…*
- [ ] admin sees all four role columns with 36 editable checkboxes (the payroll row follows 查看薪資); admin's own 管理角色與權限 and 使用管理後台 boxes are disabled; employee has no 管理後台 — *…admin sees the full matrix…*
- [ ] hr and manager see only their own column, read-only, and can still open 待決議題 — *…sees only their own column…*
- [ ] Granting manager 查看薪資 makes pay and Payroll appear for manager; 還原預設 removes them again — *…a change made by admin takes effect…*

#### Test 1.2: Data scope (HR › 員工資料)
- [ ] admin and hr see all 23 employees — *Data scope › admin and hr see all 23 employees*
- [ ] manager sees only the 8 O1 staff; the office filter is disabled; a note says 15 records are hidden — *…manager sees only O1 staff…*
- [ ] With the assumption toggle ON, manager sees all 23 and the filter is enabled — *…assumption toggle opens the manager…*
- [ ] admin filtering to 竹東日照中心 shows 9 employees — *…office filter narrows admin…*
- [ ] manager's 出勤管理 and 請假審核 show only O1 — *…manager attendance and leave views are limited to O1*

#### Test 1.3: Announcements, org chart, directory (公告欄)
- [ ] Board: admin sees all 9 posts; manager sees 8 (group-wide plus O1) — **manual**
- [ ] Board: admin and hr get **發布公告** (group post); manager gets **發布本中心公告** (facility post) — **manual**
- [ ] Org chart: every role sees the full structure; for manager, other facilities collapse to "N 位同仁（不在範圍內）" — **manual**
- [ ] Directory: manager sees 8 / 23, with mobile numbers locked (僅人資／管理員) — **manual**

#### Test 1.4: Employee role & 私人秘書 (My Desk)
Modelled on the 104 企業大師「私人秘書」employee page: 首頁 / 表單 / 查詢 / 課程.
- [ ] Switching to employee lands on 私人秘書 › 首頁; the nav holds only 原型說明, 私人秘書 and 公告欄; the assumption toggle is gone — *Employee role & 私人秘書 › employee lands on 私人秘書…*
- [ ] The month calendar shows 正常 / 遲到 / 未打卡 / 請假 / 例假日 / 休息日 / 國定假日 per day with punch times, 尚未打卡 today, and 審核中 on days with a pending form — *…home calendar shows each day's status…*
- [ ] 未簽核表單 reads 太好了！您目前沒有待處理事項 for an employee; 追蹤表單 lists their open forms (L242, OT31) — *…nothing to sign and tracks their own open forms*
- [ ] 抽單 on a pending leave marks it 已抽單 — *…withdrawing a pending leave closes it*
- [ ] Clicking a day and 請假單 opens the leave form for that date — *…clicking a calendar day prefills the leave form…*
- [ ] 公出差旅單: employee files → director approves (from 私人秘書 › 表單簽核) → HR countersigns → 已核准 — *…off-site form goes through director approval and HR countersign*
- [ ] 銷假單 on approved leave L236: director → HR → L236 shows 已銷假 — *…cancelling approved leave marks it cancelled…*
- [ ] 文件證明申請單 goes straight to HR (待人資複核); the director never sees it — *…certificate requests skip the director…*
- [ ] 查詢 › 薪資袋 lists only paid months (06–08), matches the payroll figure, and shows no employer-cost lines — *…payslip shows the employee's own paid months…*
- [ ] 部屬資料 (部屬出勤資料, 部屬工作日誌) appears only for approvers; the O1 director sees 7 reports — *…only approvers get the 部屬資料 look-ups*
- [ ] 同事今天請假或公出嗎？ lists colleagues at the same site but never the leave type — *…who-is-out names colleagues but never their leave type*
- [ ] 批次忘刷 files one 忘刷申請單 per ticked day — *…batch missed punches files one correction per ticked day*
- [ ] 預先加班單, 勞健保證明申請單, 表單通知, 保險費, 所得稅, 人事資料, 年度假勤, 公司規章下載 and 課程 render and submit without errors — **manual**
- [ ] At 390px width the calendar fits the screen with no sideways scrolling — **manual**

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
- [ ] Rotating staff (nurses and care attendants at O1 and O2) get start and end times from 00:00 to 24:00, the start date's shift, and 整班 / 前半班 / 後半班 quick picks that fill in that day's shift: on an overnight day, 整班 = 00:00–08:00; on an evening day, 後半班 = 20:00–24:00 (4 h). No built role rotates, so the test points admin's persona at E2203 — *…rotating staff can request leave for evening and overnight shifts*
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

### Phase 9: v2.2 — 30 Sept meeting items

| # | Role | Steps | Expected |
|---|------|-------|----------|
| 9.1 | hr | HR › 員工資料 | 狀態 column beside the name; every demo employee shows 在職; 計薪方式 shows 月薪制 (21) and 時薪制 (2) |
| 9.2 | hr | Open any employee › 任職與薪資歷程 › 變更狀態 › 留職停薪 | Status chip changes; a 留職停薪 row is added to the history; list filter 留職停薪 returns that person |
| 9.3 | hr | Set 離職, then 在職 again | Seniority-from date restarts at the demo date; a rehire row is added |
| 9.4 | hr | Add a 調職 change | Seniority-from date and employee number are unchanged |
| 9.5 | hr | 基本與金融資料 › 編輯 | Emergency contact 1 is required; contact 2 is optional; 領薪方式 = 現金 hides bank details |
| 9.6 | admin | Open the same record | Pay method and bank details stay hidden (HR only) |
| 9.7 | hr | Set 計薪方式 = 拆帳制, open 薪資計算 | Row shows 拆帳制, amounts are 0 with a warning that it is excluded from auto-calculation |
| 9.8 | hr | 報表匯出 › all four reports | Each header contains 員工編號 and 姓名 |
| 9.9 | admin | 系統設定 | 員工編號規則 card shows letter + 5-digit serial, permanent-number rules |
| 9.11 | owner | Switch to 老闆 | Sees all 23 staff with pay visible; cannot edit permissions; roles list = 系統管理員、經理、中心主任、老闆、一般員工 |
| 9.10 | any | 權限與範圍 › 待決議題 | 9/30 table with 7 items and the 10/7 meeting date |

## Known Gaps & Open Questions

- [ ] **Open question:** should center directors see other facilities? (the assumption toggle)
- [ ] **Open question:** must payroll calculation and review be done by different people?
- [ ] **Open question:** should employees see which colleagues are out (同事今天請假或公出嗎？)? The prototype shows names but never the leave type.
- [ ] **Open question:** 預先加班單 is recorded but does not pay; should an approved pre-approval pre-fill the 加班單?
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
