# Decision log and open questions

Format: `YYYY-MM-DD — decision — why / who decided`. Keep one line each.

## Action items — 12 things to close (the same list is on 原型說明 › 範圍與進展)
Type: **Decide** = can be decided now (recommendation given, not yet a decision) · **Material** = waiting for material · **IT** = IT study · **Later**.

| # | Type | Item | Recommendation / what is needed | Owner | Due |
|---|---|---|---|---|---|
| 1 | Decide | Mobile clock-in: what a punch stores, cloud capacity, platform | Time and location only, no photo; keep punch records 5 years (Labor Standards Act art. 30, HR to confirm); plan for 300 people; Google, buy a small amount and renew yearly (about 7.5 GB, 2–3 TB is ample). Still needed: IT and the requester confirm photo / location | IT / requester | 10/21 |
| 2 | Decide | Employee-number format and prefixes | A association, B Chengxin, C Oxford, D Zengxin Health, H shared admin + 3 digits; rejoin = new number (decided); keep old 104 number in a reference column. Still needed: full 104 export | HR / IT | 10/21 |
| 3 | Decide | Roles and permissions | Use the Excel's 15 roles; drop “four provisional roles”; manager across units, day care supervisor own unit (HR pages opened, sync the Excel). Still needed: fill the “provisional” cells | requester / HR | 10/21 |
| 4 | Decide | Two org-chart versions | Formal full-name version on the announcement board; the simple version (for ordinary staff) is today's “working view”, rename it “simple”. Still needed: full names and places, directory data | admin / HR | 10/21 |
| 5 | Decide | 104: replace, connect or run in parallel | Run in parallel first; revisit replacing once attendance and revenue-share pay are stable. Still needed: which 104 modules are in use | requester / IT | 10/21 |
| 6 | Material | Approval flows (block and arrow) | Levels per role, amount thresholds, which forms need a custom flow, the feedback-form flow | admin | before 10/21 |
| 7 | Material | 仁寶 service-record Excel | Sample received 14 Oct and the import page is built (browser-only, summaries only). Still to confirm: how "cases served" is counted, whether 忘簽退 / 服務未遇 rows count as hours, an employee-number column in the export | IT / requester | 10/21 |
| 8 | Material | Continuing-education import | 3–5 people in the import template (one row per course) and the rules confirmed | training | 10/21 |
| 9 | Material | Revenue-share pay rules | Rules, data sources, exceptions, approval flow | HR / finance | TBD |
| 10 | IT | MOHW points-system connection | Confirm it is allowed and the limits; use the Excel format meanwhile; no passwords in the site or repo | IT | TBD |
| 11 | IT | Mobile clock-in go-live and input-method test | API token? location or device limits? test typing, search and saving across input methods | IT | TBD |
| 12 | Later | Q&A feature and UAT | After 1–9 settle the structure to 80–90%; Q&A after cloud and portal are live | project lead | later |

## Decision log (reference — what has already been decided or built)
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

## Parked (not for now)
- **Hosting and data residency / 個資法** — decide with the cloud platform (Google leaning); region, access logs and a personal-data safeguard plan come after the capacity and punch decisions.
- **Production path** — the prototype is static HTML; the stack, login and database for the real build wait for the cloud platform and the permission matrix.
- **ROI framing** — retiring 104 saves little; the business case rests on other value (hidden HR labour, reporting, integration).
- **Revenue-share (拆帳制) pay rules** — see action item 9.

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
- 仁寶服務紀錄：需求端期待用 Excel 匯入，在 Portal 直接呈現「目前服務個案數」「每個服務項目的使用比例」「每位居服員的日工時、週工時、累積工時」；樣本檔 10/14 收到，匯入頁已做（瀏覽器內讀 .xlsx，只留彙總，原始列丟棄；居服員用姓名對員工）。Portal 只存彙總，個案敏感資訊留在仁寶（v2.0 規格 2.2）。

## 10/14 會議：雲端空間規劃與系統功能修改
- 下次會議：10/21（三）10:00，地點待確認（第四次會議正式紀錄 V2.0）。
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
- 日照主管有自己的身分（示範人員 A001，只看所屬單位）。10/14 後續：日照主管的人事系統頁面（員工資料、我的工時、出勤管理、請假審核）已開放，內容限所屬單位；職稱對照表日照主管那四列由「不可」改為「可」。
- 上方「假設」開關改名為「主管可跨單位查看」，影響日照主管等只看所屬單位的身分。

## 第四次會議正式紀錄（10/14，V2.0）已整合
- 網站「文件管理 › 會議紀錄」最上面一張是第四次會議紀錄（9 項討論事項、6 項待辦、下次會議 10/21（三）10:00，地點待確認）；「原型說明 › 範圍與進展」的決議清單新增 9 項 10/14 決議；後續追蹤事項新增衛福部積分系統串接、通訊錄確認兩項。
- 正式紀錄比會議筆記多出：衛福部積分系統與入口網站串接（IT 研究）、內部通訊錄資料維護（人事）、中文輸入法相容性測試（IT）、Q&A 互動功能（雲端與 Portal 完成後）。
- 待確認：紀錄的組織圖「正式版（管理與行政）」「簡易版（一般員工查閱）」與網站的「公告欄 › 組織圖（正式全名版）」「權限與範圍 › 組織圖（功能版）」如何對應。

## 繼續教育積分（私人秘書 › 課程，10/14 後續）
- 依需求端提供的積分系統畫面與 Excel（總表＋每人一張工作表）建置：我的積分（四張總表、點數字進入課程清單）、全員進度（篩選、點進個人、匯出 Excel）、缺口分析（依未達標人數排序，供教育訓練設計明年度課程）、效期 12 個月內到期。
- 規則（依 Excel 表頭與積分系統畫面整理，以主管機關規定為準）：每 6 年 120 積分；總積分＝專業課程＋min(品質＋倫理＋法規, 36)；品質倫理法規合計至少 24；消防、緊急、感控、性別各至少一堂且合計至少 10；原住民族與多元族群文化依認證效期累計（117 年效期各 6 點）；網路課程至多 80 點。
- 資料是示範資料（12 位長照人員，課程名稱與積分取自 Excel 的常見課程）；沒有把任何真實人員的積分放進網站或程式庫。
- 新權限「查看全員繼續教育積分」：系統管理員、人資、管理者、老闆、教育訓練專員看全部；日照主管、居服主管、居家服務督導、A個管主管只看所屬單位（暫定，待確認）。
- 積分系統無法匯出全員資料：網站提供「匯入範本」（一列一門課，欄位為各類積分）；匯入功能待教育訓練確認格式後再做。串接政府積分系統需要先確認是否被允許，帳號密碼不放進網站或程式庫。
- 待確認：Excel 的 CPR 效期、長照小卡效期欄位來源；非長照職稱（社工、個案管理員、司機等）是否也要追蹤其他證照時數。

## 2026-10-14 精簡畫面
- 範圍（需求者選定）：規劃中的空頁、文件管理的重複內容、原型說明與權限的待決頁、雙語文字。做法：收進「更多頁面」預設隱藏，不刪程式，可還原；長說明文字尚未改寫。

- 2026-10-14 — 下次會議議程（5 件事：簽核與組織圖、仁寶匯入定義、正式版架構、104 取代或並行、權限暫定格子）已寫進使用指南「下次會議議程」，附可傳給同事的訊息。

## 2026-10-15 管理者首頁待辦
- 頂列「待辦」按鈕 + 人事系統 › 今日待辦。待辦頁不在職稱權限 Excel 內（Excel 以項目名稱為準，新增列會被當成未填），改用規則：看得到人事系統任一頁就看得到。預設登入頁沒有改成待辦（待決定）。

## 2026-10-16 手機版（PWA）
- 做法：手機優先的 PWA（可加入主畫面），不是原生 iOS／Android App（原生需另外開發、上架）。第一版：打卡、工時與加班／補刷卡、請假、出勤月曆；示範資料，存在手機瀏覽器。
- 未做、待決議（議程第 3 項）：定位與照片是否記錄、保存年限與個資法／同仁同意（法規未查證，請法遵確認）、登入、資料存放與對接、班別與遲到／午休規則、離線打卡。

- 2026-10-16 — 給同事的議程訊息加入手機版：現況說明、第 3 項改為含手機版打卡示範，並請同事會前用自己的手機試用、記下不順之處。

- 2026-10-16 — 手機版從議程第 3 項獨立成第 6 項「手機版打卡與工時」（現場示範＋決定位置／照片、班別與遲到／午休、離線打卡、網頁版或原生 App）；第 3 項回到登入、資料庫、雲端空間、對接、人數、預算。議程改為 6 件事、約 70 分鐘。

## 2026-10-19 v3.2
- 公告欄組織圖改為由上往下的傘狀圖，一頁看完（需求端要求）。
- 上傳欄位統一列出接受格式；檔案大小上限待決定（雲端空間規劃，議程第 3 項）；仁寶匯入只讀 .xlsx。
- 版本 v3.2；左下角與系統設定改顯示「修訂日期」，部署時以最後一次提交的日期（台北時間）自動更新；原「展示日期」只保留在系統設定的「示範資料的今天」。
