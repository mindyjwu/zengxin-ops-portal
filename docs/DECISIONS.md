# Decision log and open questions

Format: `YYYY-MM-DD — decision — why / who decided`. Keep one line each.

## Decided
- 2026-09-30 — This repo is the single canonical repo; `ltc-ops-portal` is archived as a predecessor.
- 2026-09 — Scope is three companies, 誠馨、誠芯、牛津, all in greater Hsinchu, same functions; plus shared admin (共用行政). 彰化 and 台中 are only a future expansion idea — owner.
- 2026-09 — Brand is 誠馨日照; use day care (日照) wording — owner.
- 2026-09 — There is no overnight shift — owner.
- 2026-09 — Employees see only the names of colleagues who are out, never the leave type — owner.
- 2026-09 — 預先加班單 is approval only and does not pay — owner.
- 2026-09 — Cash pay (no bank account) must be an option alongside bank transfer — owner.
- 2026-09-30 — Staff at all three sites use one centralized system — 9/30 meeting.
- 2026-09-30 — Add an individual-employee role (own punch records, leave requests and status, leave balance); management and employees see completely different interfaces; nurse-type roles still to define — 9/30 meeting.
- 2026-09-30 — Employee number is the primary identifier for people with the same name; every report shows employee number and Chinese name — 9/30 meeting.
- 2026-09-30 — Employment statuses are 在職、留職停薪、離職 — 9/30 meeting.
- 2026-09-30 — Tenure carries over on cross-unit transfers (employee number unchanged); it restarts only on rehire after leaving — 9/30 meeting.
- 2026-09-30 — Employee fields: two emergency contacts (one required), insurance enrolment date, voluntary pension, bank account (incl. cash), job history, training records, license upload — 9/30 meeting.
- 2026-09-30 — Time records in half-hour units; reports export as CSV or Excel — 9/30 meeting.
- 2026-09-30 — Storage: cloud service for now, own hardware once the company grows, always double backup — 9/30 meeting.
- 2026-09-30 — Owner: cost is not the main concern for replacing 104 (NT$1,500/month); the goal is a long-term system for a future 2,000 employees — 9/30 meeting.
- 2026-10-07 — Third meeting (10:00–11:40, Teams; official minutes V2.0 plus a recording summary). Next meeting: Wed 14 Oct, 10:00, venue to confirm.
- 2026-10-07 — The portal gets an external link to 仁寶 officially named 「居服個案管理系統」. 仁寶 connects to the MOHW system directly; because of current integration limits the plan is to download Excel reports from 仁寶 and import them into the portal for summary analysis. The recording summary adds that 仁寶 does not allow outside connections, so there is no live integration for now.
- 2026-10-07 — The system is always written 仁寶 (the 9/20 spelling is right; the 9/30 notes misspelt it).
- 2026-10-07 — Employee numbers: the requester side compiles the 104 conversion, rehire tenure restart and re-numbering principles; the HR database is redesigned on that logic. The portal fills numbers in automatically from a configured rule; A/B/C prefixes are provisional and the requester side can supply a custom format.
- 2026-10-07 — Mobile clock-in already works in the portal; only cloud storage is missing, and its purchase spec, capacity and budget need assessing (the recording summary also mentions an API token).
- 2026-10-07 — Form approval follows the company org chart automatically; a new 「自訂流程」 lets managers adjust approval nodes by hand. Levels follow the administrative org chart and the amount can change the number of levels. Leave, trip and comp-time forms look alike and deduct from leave balances automatically.
- 2026-10-07 — Permissions are simplified to “confirm the title and the items follow” (title × item matrix), with no per-employee setup. The four current roles are provisional.
- 2026-10 — Wording confirmed by the owner for the recording summary: 誠興 / 第二誠心 → 誠馨 / 誠芯, 青玉反映 → 意見反映, 簽合 → 簽核, 一體式系統 → 仁寶, 製造 → “create a sub-category” (the system admin creates sub-categories under a role category such as Employee; not a job title).
- 2026-10-07 — Settle the overall structure (org chart, permissions, flows) to 80–90% before UAT (recording summary).
- 2026-09-20 — Meeting decisions (one account per person by employee number; managers and shared admin can switch company; HR maintains data, employees only view; monthly / hourly / revenue-share pay; link out to existing systems) are listed on 原型說明 › 範圍與進展 — 9/20 meeting minutes.

## Open (resolve with the requester side before building on them)
1. ~~**Number of sites**~~ — answered: three companies (see Decided). The "7 offices" figure has no source and was removed.
2. **104 usage:** which 104 modules are actually in use? (Drives Plan A "keep 104 + CSV import" vs Plan B "replace 104".)
3. ~~**仁寶 integration:** API, webhook, or CSV export?~~ — answered by the 7 Oct meeting: no outside connection; link out by button (see Decided).
4. **Roles:** confirm the deck p.6 role matrix (老闆、管理者、人資、教育訓練專員、會計、系統管理員、一般人員) and data-scoping rules (can managers see other companies, payroll visibility, leave approval levels). Deck p.15 lists the other open decisions.
5. **Hosting/data residency:** who owns infrastructure, where does production data live, how is 個資法 compliance handled?
6. **ROI framing:** savings from retiring 104 are modest — define the business case on other value (hidden HR labor, reporting, integration).
7. **Production path:** the prototype is static HTML. Choose stack, auth, database, and hosting for the 300+ employee build.
8. **拆帳制 (revenue-share) pay rules** — not yet defined.
9. **Links** for 居服個案管理系統 (仁寶), 衛福部長照系統 and 誠馨雲端（NAS） — waiting on IT.
10. **Employee-number prefix** — proposal only (9/30): replace the per-company prefixes (e.g. CSHR, OXHR) with A/B/C-style letters, keeping room for acquisitions. Not decided; the prototype demos the proposal (誠馨 A, 誠芯 B, 牛津 C; shared admin uses H).
11. ~~**Case-management system name**~~ — answered: it is 仁寶; the 9/30 notes misspelt it.
12. **Target size** — the 9/30 notes say 2,000 employees long term; `CLAUDE.md` says 300+. Confirm which one to design for.
13. **Management role names** — the 9/30 notes list the current roles as system administrator, manager and 院長; the prototype uses system administrator, HR and manager (day care supervisor).
14. **Rehire rule** — tenure restarts on rehire after leaving (9/30, 10/7). The prototype restarts tenure from the rejoin date; whether the employee number is re-issued (員編重編) waits for the HR/IT principle.
15. **Title × item permission matrix and org chart** — due from the requester side / HR before the next meeting (7 Oct action 2); needed to define the nurse, social-worker and supervisor titles. The portal has an Excel template.
16. **104 export** — export 104 data first, review the format, then build the pay logic (9/30).
17. **Four provisional roles** — the requester side confirms or changes them; the project lead builds the formal table from the filled title matrix.
18. **Org chart, approval-path rules, form fields** — due from the requester side; levels and amount thresholds for approvals depend on them. Feedback-form approval details are to be uploaded after the meeting.
19. **Group-wide employee-number principle** — HR/IT to define it and inventory existing numbers (7 Oct action 3); the portal's rule (Settings › Employee-number rule) is provisional.
20. **Mobile clock-in** — purchase spec, capacity and budget of the cloud storage (and whether an API token is also needed).
21. ~~**Wording in the recording summary**~~ — all confirmed; 「製造」 means “create”: the system admin can create sub-categories under a role category (e.g. under Employee).
22. **仁寶 Excel import layout** — IT tests the layout and reports at the next meeting (7 Oct action 5); until then the portal shows no demo data for it.
23. **Attendance scope** — IT assesses the scope, cost and rollout of attendance in the portal after the 104 inventory (7 Oct action 4).

## Repo hygiene tasks
- [ ] Set this repo to **private** (or stop publishing the real operator name via Pages) — owner action in GitHub settings.
- [ ] Port the fictional-operator public build (`make-public.py`) from the archived predecessor, then publish only that build.
- [ ] Fix/confirm the GitHub Pages deploy workflow (failures were reported around Sept 22).
- [ ] Export existing Word deliverables from past chats into `docs/deliverables/`.

## 權限連動（使用者指定以 Excel 為準）
- 四個身分各對應 Excel 的一欄：系統管理員→系統管理員、人資→人資主管、管理者→管理者、一般員工→一般員工：照服員。看得到哪些頁面由該欄決定（可／可檢視／可編輯 = 看得到；不可／空白 = 看不到）。
- 系統管理員永遠保有「權限與範圍」，避免鎖死自己。
- 資料範圍（本公司／全部）、薪資欄位、簽核仍照原「權限對照表」；Excel 沒有規定這些。
- 原型的「管理者」身分原本標示為「管理者（日照主管）」，Excel 把「管理者」和「日照主管」分成兩欄；目前對應「管理者」欄，「日照主管」欄尚無身分可切換。待確認。
- 其餘職稱欄位（老闆、日照主管、居服主管等）還沒有可切換的身分。
