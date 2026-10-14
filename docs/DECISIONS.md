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
14. ~~**Rehire rule**~~ — answered 13 Oct: a rejoin after leaving is a new hire with a new employee number (the old number is not reused) and tenure restarts.
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
- 原型的「管理者」身分原本標示為「管理者（日照主管）」，Excel 把「管理者」和「日照主管」分成兩欄；目前「管理者」身分對應「管理者」欄；「日照主管」另有自己的身分（誠芯的日照主管示範人員）。待確認原本的「管理者（日照主管）」該拆成兩個，或保留合併。
- 其餘 11 個欄位也各有可切換的身分（共 15 個）：老闆、教育訓練專員、會計、日照主管、日照社工/護理師、居服主管、居家服務督導、A個管主管、A個管、一般員工：司機、一般員工：居服員。頁面權限由 Excel 決定；資料範圍與細項權限是依職稱推定的暫定值（老闆、教育訓練專員、會計跨三家公司依簡報第 6 頁；其餘限本公司；司機、居服員只看本人），待確認。
- 薪資計算寫「可檢視」的身分（老闆、管理者）看得到但不能儲存版本或覆核。
- 居服主管、A個管主管沒有同名的示範人員，借用居家服務督導、個案管理員的示範人員，畫面上標示職稱。
- 細項權限（資料範圍、薪資、簽核等 14 列）也改成 Excel 的可／不可格式，涵蓋 15 個身分，系統管理員可切換並下載 Excel；新增 11 個身分的格子是暫定值。

## 10/13 需求端更新：組織圖與 104 匯出
- 主體單位是 4 個：1 家協會（社團法人中華民國誠馨照顧協會）＋3 家公司（誠馨健康、誠芯樂活、牛津樂活），各有附設機構；組織圖仍因業務需求動態調整，之後會逐步收斂各業務、與部分機構整合，屆時組織圖與職稱可能再統一調整。
- 目前的簽核流程有部分與組織圖不一樣，需求端會再想怎麼呈現。
- 「A個管」是政府的命名（Ａ單位個管師）；「A個管主管」「日照主管」是跨單位的浮動主管（組織圖虛線箭頭）。
- 網站已放入組織架構樹（公告欄 › 組織圖）；示範資料新增第 4 個主體「誠馨健康」（員工編號前綴 D、2 位示範人員）。資料範圍與前綴的對應是暫定：A＝協會、B＝誠芯、C＝牛津、D＝誠馨健康，待確認；系統管理員未出現在圖上，仍放共用行政。
- 組織圖上「管理者」在 4 個主體之上；原型的「管理者」身分目前只看所屬單位（示範人員是日照主管），要不要改成跨單位待確認。
- 104 員工資料匯出範例（1 筆）與畫面截圖已收到：欄位已整理在「文件管理 › 104 功能對照」，不含人員資料；104 員工編號是各單位自己的前綴（例如 CSCT 開頭），全部在職同仁的完整匯出仍待提供。

## 10/13 需求端回覆（對 10/7 待補清單）
- 權限對照表：已提供（職稱權限對照表 Excel），已帶入；細項權限表（暫定）仍待需求端確認。
- 組織圖：已提供（見上）；簽核流程要再討論確認，需求端再想怎麼呈現。
- 員工資料：104 匯出範例已提供；**離職後回任以新進人員重新編號，不沿用舊員編**（已確認）；全公司員編原則預計 10/14 會議前提出。原型：已離職的人不能改回在職，回任要「新增員工」建新編號，前員編只供對照。
- 手機打卡雲端空間：需求端請我們協助估算方法（打卡筆數只是一部分）。網站新增「雲端儲存空間估算」，預設值是假設；關鍵變數是是否存照片或定位、保存年限、300 或 2,000 人、雙備份的定義。
- 仁寶服務紀錄：需求端期待用 Excel 匯入，在 Portal 直接呈現「目前服務個案數」「每個服務項目的使用比例」「每位居服員的日工時、週工時、累積工時」；樣本檔案這次沒收到，待收到後才做欄位對照與匯入。Portal 只存彙總，個案敏感資訊留在仁寶（v2.0 規格 2.2）。

## 10/14 會議：雲端空間規劃與系統功能修改
- 下次 Meeting：10/20 晚上 10 點（台灣時間 10/21 早上）。
- 雲端空間：以 300 人為基準，預估 2–3 TB 應足夠（若沒有大量照片）；每年續約調整、隨時擴充，不需一次買足。平台 AWS／Google Cloud／Azure 三選一，傾向 Google（員工多已有 Gmail 帳號）。下一步：用 GPT／Gemini 帶入四個問題（拍照打卡、定位、保存年限、人數）估算實際容量，再決定。
- 網站目前是 Demo：資料寫在程式裡（連接 GitHub），沒有雲端儲存；任何修改都不會真正保存，要等登入系統與雲端儲存串接。
- 角色：「管理者（日照主管）」改為「管理者」；移除「一般員工」欄位（已細分為一般員工：照服員／司機／居服員，仍是 15 個身分）。
- 組織圖分兩個 Tab：公告欄＝正式全名版（法人名稱）；權限與範圍＝功能版（職位＋地點，找對接窗口）。組織圖可由員工自行編輯（要等雲端串接才能保存，原型是示範）。
- 內部通訊錄移到「權限與範圍」，新增部門篩選；修正中文（注音）輸入被打斷（組字中不重繪，組字結束才更新）。
- 請假申請新增附件上傳（原型只記檔名）；「個人工作日誌」從私人秘書查詢移除；勞健保證明期間改為自訂起訖月份（最短一個月、整月計算）；所有表格凍結首行與首欄。
- 簽核流程：待確認各職務簽核層級（部分流程不依組織圖走）；建議以類似組織圖的 Block＋Arrow 架構呈現，方便未來調整。簽核路徑預覽已改成方塊＋箭頭樣式，實際規則待需求端整理。
- 長照教育訓練時數：政府網站無法匯出全員資料，目前逐人查；需求端會提供網站連結、帳號密碼與現有 Excel 格式，由專案負責人研究串接可行性。**帳號密碼不放進網站、程式庫或公開文件；建議改用專用、唯讀的帳號，並先確認串接政府網站是否被允許。**
- 仁寶服務記錄總表 Excel：下次會議匯入，呈現員工工時與服務數。

## 管理者改為跨單位（10/14 後續）
- 「管理者」身分的示範人員改為共用行政的管理者（H002），資料範圍跨所有單位，對應組織圖上位於 4 個主體之上的管理者。
- 日照主管有自己的身分（示範人員 A001，只看所屬單位）；依職稱對照 Excel，日照主管沒有人事系統頁面，所以人事資料、出勤、請假審核只有管理者、老闆、人資主管、系統管理員看得到。
- 上方「假設」開關改名為「主管可跨單位查看」，影響日照主管等只看所屬單位的身分。
