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
- 2026-10 (latest meeting, date not in the notes) — 仁寶 does not allow outside connections: the portal links to it with a button; function integration is on hold; focus stays on the internal admin and HR modules.
- 2026-10 (latest meeting) — The system is always written 仁寶 (the 9/20 spelling is right; the 9/30 notes misspelt it).
- 2026-10 (latest meeting) — Permissions are set by ticking boxes per role; the four current roles are placeholders for the client to confirm or change; Employee can have sub-categories (e.g. driver, contractor) with their own permissions.
- 2026-10 (latest meeting) — All requests use one form, approved level by level along the administrative org chart; the amount can change the number of levels; leave, trip and comp-time forms look alike and deduct from leave balances automatically.
- 2026-10 (latest meeting) — Employee numbers are filled in automatically from a configured rule; A/B/C is a placeholder and the client can supply a custom format.
- 2026-10 (latest meeting) — Mobile clock-in is feasible but needs Cloud Storage and an API token to go live; mobile/desktop polish later. Settle the overall structure (org chart, permissions, flows) to 80–90% before UAT.
- 2026-09-20 — Meeting decisions (one account per person by employee number; managers and shared admin can switch company; HR maintains data, employees only view; monthly / hourly / revenue-share pay; link out to existing systems) are listed on 原型說明 › 範圍與進展 — 9/20 meeting minutes.

## Open (resolve with the client before building on them)
1. ~~**Number of sites**~~ — answered: three companies (see Decided). The "7 offices" figure has no source and was removed.
2. **104 usage:** which 104 modules are actually in use? (Drives Plan A "keep 104 + CSV import" vs Plan B "replace 104".)
3. ~~**仁寶 integration:** API, webhook, or CSV export?~~ — answered by the latest meeting: no outside connection; link out by button (see Decided).
4. **Roles:** confirm the deck p.6 role matrix (老闆、管理者、人資、教育訓練專員、會計、系統管理員、一般人員) and data-scoping rules (can managers see other companies, payroll visibility, leave approval levels). Deck p.15 lists the other open decisions.
5. **Hosting/data residency:** who owns infrastructure, where does production data live, how is 個資法 compliance handled?
6. **ROI framing:** savings from retiring 104 are modest — define the business case on other value (hidden HR labor, reporting, integration).
7. **Production path:** the prototype is static HTML. Choose stack, auth, database, and hosting for the 300+ employee build.
8. **拆帳制 (revenue-share) pay rules** — not yet defined.
9. **Links** for 仁寶 i 照護, 衛福部長照系統 and 誠馨雲端（NAS） — waiting on IT.
10. **Employee-number prefix** — proposal only (9/30): replace the per-company prefixes (e.g. CSHR, OXHR) with A/B/C-style letters, keeping room for acquisitions. Not decided; the prototype demos the proposal (誠馨 A, 誠芯 B, 牛津 C; shared admin uses H).
11. ~~**Case-management system name**~~ — answered: it is 仁寶; the 9/30 notes misspelt it.
12. **Target size** — the 9/30 notes say 2,000 employees long term; `CLAUDE.md` says 300+. Confirm which one to design for.
13. **Management role names** — the 9/30 notes list the current roles as system administrator, manager and 院長; the prototype uses system administrator, HR and manager (day care supervisor).
14. **Rehire rule** — tenure restarts on rehire after leaving (9/30); the prototype does not model rehire yet.
15. **Role permission lists and org chart** — due from the team before the 10/7 meeting; needed to define the nurse, social-worker and supervisor roles.
16. **104 export** — export 104 data first, review the format, then build the pay logic (9/30).
17. **Four placeholder roles** — the client confirms or changes them and sends all roles and permission items as Excel (the portal has a worksheet template); the project lead builds the formal table.
18. **Org chart, approval-path rules, form fields** — due from the client; levels and amount thresholds for approvals depend on them. Feedback-form approval details are to be uploaded after the meeting.
19. **Custom employee-number format** — the client may supply one; the portal's rule (Settings › Employee-number rule) is a placeholder.
20. **Mobile clock-in** — who buys Cloud Storage and an API token, and when.
21. **Wording in the latest notes** — 誠興 / 第二誠心 (read as 誠馨 / 誠芯), 青玉反映 (read as 意見反映), 簽合 (read as 簽核), 一體式系統, and the sub-category example 製造 need confirming; the notes have no date.

## Repo hygiene tasks
- [ ] Set this repo to **private** (or stop publishing the real operator name via Pages) — owner action in GitHub settings.
- [ ] Port the fictional-operator public build (`make-public.py`) from the archived predecessor, then publish only that build.
- [ ] Fix/confirm the GitHub Pages deploy workflow (failures were reported around Sept 22).
- [ ] Export existing Word deliverables from past chats into `docs/deliverables/`.
