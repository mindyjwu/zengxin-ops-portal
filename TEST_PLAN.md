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
- Cross-company data visibility (data scope: 誠馨、誠芯、牛津 and 共用行政)
- Leave, overtime and missed-punch approvals
- Payroll and CSV exports
- Employee self-service (私人秘書): own attendance, forms, payslips and nothing else

---

## Test Data

The prototype has no login and no database. All data is fictional and lives in
browser memory, so **reloading the page resets everything**. Staff names are
generated demo data.

The demo date defaults to **2026-10-07**. Add `?demoDate=YYYY-MM-DD` to change
it; the automated tests open the page with `?demoDate=2026-09-08`, so the
request IDs and dates below refer to that date.

The content is based only on the 9/20 meeting minutes, the 15-page requirements
deck, the v2.0 spec and decisions the owner gave directly. All three companies
are in greater Hsinchu and work the same way. 彰化 and 台中 are listed only as
a future expansion idea.

| Unit | ID | Staff |
|------|----|-------|
| 共用行政 (shared admin) | HQ | 6 (ADM001–ADM006) |
| 誠馨 | O1 | 10 (A001–A010) |
| 誠芯 | O2 | 9 (B001–B009) |
| 牛津 | O3 | 3 (C001–C003) |
| **Total** | | **28** |

---

## Roles & Permissions Matrix

Switch roles with the **身分 / Role** selector (`#roleSel`) at the top of every page.

| | 系統管理員 System Admin (`admin`) | 人資 HR (`hr`) | 管理者（日照主管）Manager (`manager`) | 一般員工 Employee (`employee`) |
|---|---|---|---|---|
| Persona | ADM005, 共用行政 | ADM003, 共用行政 | A001, 日照主管 at 誠馨 | A004, 照服員 at 誠馨 |
| Data scope | All companies | All companies | 誠馨 only (all if the assumption toggle is ON) | Own records only; announcements and directory for 誠馨 |
| 私人秘書 My Desk (own calendar, forms, payslips) | ✅ | ✅ | ✅ | ✅ (lands here) |
| Back office (人事、權限、文件、線上申請、業務資料整合、報表) | ✅ | ✅ | ✅ | Hidden |
| See pay, band, bank account | ❌ | ✅ | ❌ | Own payslip only |
| Full national ID | ❌ (masked, last 3 shown) | ✅ | ❌ (masked) | Own, masked |
| Contact details (mobile, address, emergency) | ✅ | ✅ | ❌ | Own only |
| Edit personnel file | ✅ | ✅ | ❌ | ❌ |
| Add performance appraisal | ✅ | ✅ | ✅ | ❌ |
| Approve leave / overtime / punch fixes / other forms | ❌ | ✅ | ✅ | ❌ |
| HR countersign (final approval) | ❌ | ✅ | ❌ | ❌ |
| Post announcements | All companies | All companies | Own company only | ❌ |
| Payroll module | Hidden | ✅ | Hidden | Hidden |
| Settings (系統設定) | ✅ | Hidden | Hidden | Hidden |
| Permission matrix (權限與範圍) | Full matrix, editable | Own column, read-only | Own column, read-only | Hidden |
| Payroll (financial) CSV export | ❌ | ✅ | ❌ | ❌ |
| Other CSV exports | ✅ (all companies) | ✅ (all companies) | ✅ (誠馨 only) | ❌ |

The **假設 / Assumption: 管理者可跨公司查看** button (`#assumeBtn`) is a discussion
toggle: when it is ON, the manager reads all three companies. The page header
shows a **目前公司** chip naming the company in view. It is hidden for the
employee role, whose scope never widens. In every role, nobody can approve their
own request.

The deck's role matrix (p.6) also lists 老闆, 教育訓練專員 and 會計. They are
shown on 原型說明 › 角色與權限 but not built, and don't appear in the role selector.

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
- [ ] admin and hr see all 28 employees — *Data scope › admin and hr see all 28 employees*
- [ ] manager sees only the 10 誠馨 staff; the company filter is disabled; a note says 18 records are hidden — *…manager sees only O1 staff…*
- [ ] With the assumption toggle ON, manager sees all 28 and the filter is enabled — *…assumption toggle opens the manager…*
- [ ] admin filtering to 誠芯 shows 9 employees — *…office filter narrows admin…*
- [ ] manager's 出勤管理 and 請假審核 show only 誠馨 — *…manager attendance and leave views are limited to O1*

#### Test 1.3: Announcements, org chart, directory (公告欄)
- [ ] Board: the posts come from the meeting minutes and the spec (A01–A08); admin sees all of them; manager sees the all-company posts plus 誠馨's — **manual**
- [ ] Board: admin and hr get **發布公告** (all companies); manager gets **發布本公司公告** (own company) — **manual**
- [ ] Calendar: only the 9/20 meeting, the 9/27 and 9/30 due items, the 9/30 meeting, the 10/15 Renbao / MOHW due date and the 10/31 MVP target — **manual**
- [ ] Org chart: columns for 共用行政 and each company, grouped by department; for manager, other companies show their supervisors dimmed plus a count of the rest — **manual**
- [ ] Directory: manager sees 10 / 28, with mobile numbers locked (僅人資／管理員) — **manual**

#### Test 1.4: Employee role & 私人秘書 (My Desk)
Modelled on the 104 企業大師「私人秘書」employee page: 首頁 / 表單 / 查詢 / 課程.
- [ ] Switching to employee lands on 私人秘書 › 首頁; the nav holds only 原型說明, 私人秘書 and 公告欄; the assumption toggle is gone — *Employee role & 私人秘書 › employee lands on 私人秘書…*
- [ ] The month calendar shows 正常 / 遲到 / 未打卡 / 請假 / 例假日 / 休息日 / 國定假日 per day with punch times, 尚未打卡 today, and 審核中 on days with a pending form — *…home calendar shows each day's status…*
- [ ] 未簽核表單 reads 太好了！您目前沒有待處理事項 for an employee; 追蹤表單 lists their open forms (L242, OT31) — *…nothing to sign and tracks their own open forms*
- [ ] 抽單 on a pending leave marks it 已抽單 — *…withdrawing a pending leave closes it*
- [ ] Clicking a day and 請假單 opens the leave form for that date — *…clicking a calendar day prefills the leave form…*
- [ ] 公出差旅單: employee files → manager approves (from 私人秘書 › 表單簽核) → HR countersigns → 已核准 — *…off-site form goes through director approval and HR countersign*
- [ ] 銷假單 on approved leave L236: manager → HR → L236 shows 已銷假 — *…cancelling approved leave marks it cancelled…*
- [ ] 文件證明申請單 goes straight to HR (待人資複核); the manager never sees it — *…certificate requests skip the director…*
- [ ] 查詢 › 薪資袋 lists only paid months (06–08), matches the payroll figure, and shows no employer-cost lines — *…payslip shows the employee's own paid months…*
- [ ] 部屬資料 (部屬出勤資料, 部屬工作日誌) appears only for approvers; the 誠馨 manager sees 6 day care reports — *…only approvers get the 部屬資料 look-ups*
- [ ] 同事今天請假或公出嗎？ shows only the names of colleagues at the same company who are out — no title, leave or off-site, leave type or approval status — *…who-is-out shows only colleagues' names*
- [ ] 批次忘刷 files one 忘刷申請單 per ticked day — *…batch missed punches files one correction per ticked day*
- [ ] 預先加班單, 勞健保證明申請單, 表單通知, 保險費, 所得稅, 人事資料, 年度假勤, 公司規章下載 and 課程 render and submit without errors — **manual**
- [ ] At 390px width the calendar fits the screen with no sideways scrolling — **manual**

---

### Phase 2: Salary Visibility & Personnel File

#### Test 2.1: Employee table (HR › 員工資料)
- [ ] hr sees 月薪 amounts (A003 = NT$58,000) — *Salary visibility › hr sees monthly pay*
- [ ] admin and manager see 🔒 僅人資可見 and no NT$ amounts — *…admin / manager sees the lock instead of pay*

#### Test 2.2: Personnel-file drawer (click an employee row)
The drawer has six sections: 概要, 基本與金融資料, 任職與薪資歷程, 勞健保資料, 資格與契約, 績效與文件.
- [ ] Every section opens and the drawer closes with ✕ — *Personnel file drawer › every section renders…*
- [ ] **hr:** full national ID, pay, bank account, pay history and insurance grades are shown — *…hr sees full ID, pay…*
- [ ] **admin:** national ID masked (•••, last 3 shown), contact details shown, bank account locked, pay-history bands shown as •••, insurance premiums locked — *…admin gets contact details but masked ID…*
- [ ] **manager:** mobile and address restricted (受限); bank account locked — *…manager cannot see contact details or pay*
- [ ] **manager, out of scope:** opening a 誠芯 person from the org chart shows the position only, a 不在您目前的資料範圍內 note, and no section buttons — *…manager opening an out-of-scope person…*
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

Shifts: 白班 (day) 08:00–17:00 with a 12:00–13:00 lunch; 小夜 (evening) 16:00–00:00, 8 h straight
with no lunch deduction. There is no 大夜 (overnight) shift at present: `NIGHT_SHIFT = false` in
`ltc-portal.html` keeps it off the roster, and setting it to `true` brings back 00:00–08:00 with its
leave and allowance rules. Only nurses and care attendants
outside 共用行政 rotate; HQ staff and every other title always work day shifts. 1 day = 8 h; minimum
leave unit 0.5 h.

- [ ] Clock in at 08:00 and out at 17:30 → today's row shows 白班 and 8.5 h — *My Hours › clock in and out…*
- [ ] Clocking in and out in the same minute shows no hours (—), not 24 h — *…clocking in and out in the same minute counts 0 h…*
- [ ] Punch records show a 班別 column. None of the management roles works rotating shifts, so My Hours shows 白班 for them; the employee role (A004) rotates and its 私人秘書 calendar shows evening shifts — **manual**
- [ ] Leave: the 上午 4h and 下午 4h quick picks each compute 4 h; submitting creates a pending request — *…half-day leave computes 4 h…*
- [ ] Rotating staff (nurses and care attendants outside 共用行政) get start and end times from 00:00 to 24:00, the start date's shift, and 整班 / 前半班 / 後半班 quick picks that fill in that day's shift: on a day shift, 整班 = 08:00–17:00; on an evening day, 後半班 = 20:00–24:00 (4 h). 2026-08-27, formerly an overnight shift, is now a day shift. The test points admin's persona at B003 — *…rotating staff can request leave for evening shifts; there is no overnight shift*
- [ ] Overtime: 17:00–19:00 = 2 h, 17:00–20:30 = 3.5 h, 22:00–02:00 = 4 h (crosses midnight) — *…overtime hours compute…*
- [ ] Balance (admin, ADM005): annual leave 120 h entitlement, 4 h used, 116 h left; comp time 4 h; a pending 4 h request leaves 112 h — *…balance tab reflects entitlement…*
- [ ] Overtime over the 46 h monthly cap is refused — **manual**
- [ ] 出勤異常 lists exceptions and links to 補打卡 or 補請假 — **manual**
- [ ] 工作日誌 entries appear in the attendance and personnel CSVs — **manual**

---

### Phase 5: Payroll (薪資計算, hr only)

- [ ] The Payroll module appears in the menu for hr only — **manual**
- [ ] Switching from hr to another role while on Payroll returns to 原型說明 — **manual**
- [ ] 薪資試算 excludes requests that aren't approved yet and says how many — **manual**
- [ ] Shift allowance: NT$200 per evening shift (NT$400 per overnight shift once one opens). For B003 in 2026-08 (5 evening shifts), the breakdown shows NT$1,000 and no 大夜 line, and the overtime hourly base becomes (58,500 + 1,000) ÷ 240 = 247.92 — *Payroll night-shift allowance › rotating nurse is paid per evening shift…*
- [ ] No overnight shift appears in any month's roster, and the calculator hides the 大夜 fields — *…no overnight shifts are rostered…*
- [ ] Day-shift staff (ADM003) get no allowance lines — *…day-shift staff get no allowance*
- [ ] The calculator adds the allowance per shift, and the allowance can be excluded from the overtime base — *…calculator adds allowance per shift…*
- [ ] For a part-time worker the allowance is also in the overtime rate: (160 h × 200 + 800) ÷ 160 h = 205 per hour — *…calculator includes a part-timer's allowance in their OT rate*
- [ ] With `NIGHT_SHIFT` switched on, leave is counted against the shift worked that day: on B003's 2026-08-27 overnight shift, 00:00–08:00 or a full-day 08:00–17:00 request is 8 h; on the 2026-08-21 evening shift, 13:00–17:00 is 1 h — *…leave is counted against the evening or overnight shift…*
- [ ] Partial leave on an evening or overnight shift keeps that shift's allowance; only a full-shift leave removes it — *…partial leave on an overnight shift keeps the allowance*
- [ ] Open B003's payslip for 2026-08: the 小夜 row lists the shift dates, and late minutes follow each shift's start time — **manual**
- [ ] The payroll CSV has 小夜班次, 夜班津貼 and 發薪方式 columns, and no 大夜班次 column while there is no overnight shift — *Cash pay… › payroll CSV has a pay-method column…*
- [ ] Cash pay: A007 and B006 (no salary account) show 現金發放 in the register; the 現金發放 tile totals their net pay; 現金發薪簽收清冊 lists them with signature columns and exports as `現金發薪簽收清冊_<月份>.csv` — *Cash pay… › payroll run lists cash-paid staff…*
- [ ] HR can switch an employee to 現金發放 under 薪資帳戶 in the personnel file, and they then appear on the cash list — *…HR can switch an employee to cash…*
- [ ] The employee's 薪資袋 says 匯入薪資帳戶 (masked account) or 現金發放：發薪日至人資領取並簽收 — *…the employee's payslip says how they are paid*
- [ ] A warning shows when the labor insured salary is below the bracket for regular pay including the allowance — **manual**
- [ ] 薪資計算機 shows the formula for every line — **manual**
- [ ] 版本與覆核: save version → submit → approve (locks the month) or return; unlock to recalculate — **manual**

---

### Phase 6: Reports Export (報表匯出)

- [ ] Attendance, personnel, leave and payroll CSVs download as `<報表名>_<月份>.csv` with a UTF-8 BOM and the expected header row; every report has both 員工編號 and 姓名 — *CSV exports › … report downloads with a BOM and header*; *Updates from the 9/30 meeting › every report lists both…*
- [ ] With 匯出格式 set to Excel, the same reports download as `.xlsx` (a real zip with the workbook parts; employee numbers stay text, counts stay numbers) — *Updates from the 9/30 meeting › reports can be downloaded as a real Excel…*
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

### Phase 9: Grounded content, walkthroughs and user guide

- [ ] Payroll (薪資試算), 出勤管理 and 報表匯出 open on the month of the demo date (2026-10 by default; 2026-09 with `?demoDate=2026-09-08`) — *Grounded content › payroll, attendance and reports open on the month of the demo date*
- [ ] Opening the page without `demoDate` shows 2026-10-07; 9/25 中秋節 and 9/28 孔子誕辰紀念日 are days off with no punches — *Grounded content › without a demoDate the demo date is 2026-09-29…*
- [ ] The company filter lists 誠馨, 誠芯 and 牛津; the 目前公司 chip follows the filter and shows 誠馨 for the manager — *…three companies in greater Hsinchu…*
- [ ] No module or tab, in any role, shows removed unsourced content (竹北／竹東日照中心, 康禾, 營運長, 執行長, 評鑑準備, 流感疫苗, 仁仁, 院長, 住民) — *…no page shows the removed, unsourced content*
- [ ] 文件管理 › 會議紀錄 shows the 9/20 minutes; 系統設定 links to https://pro.104.com.tw/ and lists 仁寶 i 照護; choosing 拆帳制 in the calculator shows the rules-pending note — *…meeting minutes, existing-system links and the revenue-share pay system*
- [ ] Mid-year review: as manager, 私人秘書 › 查詢 › 部屬績效考核 shows 期中考核 0 / 6; 填寫期中考核 for A003 opens 績效與文件 with the add form; saving 期中考核（上半年） makes it 1 / 6 and marks A003 已完成 — *…a manager fills in a mid-year review…*
- [ ] `?tour=leave` switches to the employee role and highlights the leave form; 下一步 walks every step and the last one closes the card — *…a walkthrough switches role and page…*
- [ ] Every step of all 9 walkthroughs (clock, leave, slip, approve, perf, ann, pay, hr, admin) highlights exactly one element — *…every walkthrough step finds what it points at*
- [ ] guide.html links only to walkthroughs that exist — *…the user guide links only to walkthroughs that exist*
- [ ] guide.html reads well in light and dark mode and at 390px width — **manual**

---

### Phase 10: Updates from the 9/30 meeting

- [ ] 文件管理 › 會議紀錄 shows the 9/30 notes (statuses, tenure, 104, case system, storage), the next meeting on 10/7 11:30 and the follow-ups; the 9/20 notes are still there; 人保 vs 仁寶 is flagged as to-confirm; the calendar has a 10/7 event — *…the minutes page holds the 9/30 notes…*
- [ ] 原型說明 › 範圍與進展 lists the 9/30 decisions with their source, where they are in the prototype, and a status — *…decisions page lists the 9/30 decisions…*
- [ ] 文件管理 › 104 功能對照 compares 104 functions item by item (in prototype / partly / not in prototype / not enabled in 104) and lists 104 job types against the prototype's titles, flagging the ones that differ — *…104 comparison tab…*
- [ ] 員工資料 shows 在職狀態: B009 留職停薪 (from 2026-08-01), C003 離職 (from 2026-09-15), everyone else 在職; the tile counts them — *…employment status: three kinds…*
- [ ] 薪資試算 leaves out unpaid-leave and resigned staff from the effective month, and says so (B009 is in 2026-07 but not 2026-08; C003 is in 2026-08 but not 2026-09) — *…drop out of payroll from the effective month*
- [ ] HR changes a status under 概要 › 變更在職狀態; the history gets an entry and the person drops out of payroll from that month — *…HR changes a status…*
- [ ] Personnel file: second emergency contact (optional; A002 has one, A003 does not), first contact required when editing, license upload field, 教育訓練記錄 and an add form — *…two emergency contacts, license upload and training records*; *…the first emergency contact is required…*
- [ ] `?tour=hr` highlights each of its three steps — *…the HR walkthrough finds its targets*
- [ ] Banned-word scan: 院長 appears only on the minutes page and the roles page, where the 9/30 notes are quoted — *Grounded content › no page shows the removed, unsourced content*
- [ ] Excel files open in a real spreadsheet program — **manual** (checked with openpyxl only)

---

## Known Gaps & Open Questions

- [ ] **Open question (Q1):** should managers see other companies? (the assumption toggle)
- [ ] **Open:** the decisions listed on deck p.15 (權限與範圍 › 待決議題)
- [ ] **Open:** the 拆帳制 (revenue-share) pay rules; the calculator shows a note and does not calculate
- [ ] **Open:** links for 仁寶 i 照護, 衛福部長照系統 and 誠馨雲端（NAS） (shown as URL pending in 系統設定)
- [ ] **Open:** permissions for 老闆, 教育訓練專員 and 會計
- [ ] **Open question:** must payroll calculation and review be done by different people?
- [ ] **Open:** employee-number prefix (9/30 proposal: A/B/C letters); the prototype now demos the proposal (誠馨 A, 誠芯 B, 牛津 C, shared admin ADM as a placeholder)
- [ ] **Open:** 仁寶 (9/20) vs 人保 (9/30) — same system?
- [ ] **Open:** target size, 2,000 (9/30 minutes) vs 300+ (CLAUDE.md)
- [ ] **Open:** roles for nurses, social workers and supervisors (permission lists due from the team before 10/7)
- [ ] **Open:** rehire after leaving restarts tenure (9/30); not modelled yet
- [x] **Decided:** employees see only the names of colleagues who are out (同事今天請假或公出嗎？).
- [x] **Decided:** 預先加班單 is approval only and does not pay; overtime is paid from the 加班單.
- [x] **Decided:** there is no overnight shift at present (`NIGHT_SHIFT = false`).
- [x] **Decided:** staff without a bank account can be paid in cash and sign a receipt list.
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
