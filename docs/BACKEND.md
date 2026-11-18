# 後端架構與部署（第一版切片）

## 現在有什麼（已用測試驗證，在本機執行）
```
手機／瀏覽器 ──HTTPS──▶ Cloud Run（server/，Node + Express）──▶ Cloud SQL（PostgreSQL）
                              │
                              └─▶ Google：驗證 ID token（google-auth-library）
```
- `server/app.js`：API（登入、`/api/me`、`/api/punch`、`/api/punches`、`/api/audit`）
- `server/auth.js`：Google ID token 驗證、簽章 cookie 工作階段、登入限流
- `server/permissions.js` + `server/roles.json`：**伺服器端**權限（規則取自網站的 ROLES，測試檢查兩邊一致）
- `server/db.js` + `server/migrations/`：資料庫連線與建表（正式用 PostgreSQL；本機與測試用 PGlite，同一套 SQL）
- `backend/punch-ip.js`：伺服器自己讀 IP、辦公室網段比對、五年保存日
- `server/employees.js`：員工與角色管理 API（新增、修改、停用、改角色、CSV 批次匯入）
- `web/`：**連後端版網站**。登入頁（`index.html`）→ 應用程式（`app.html`＋`main.js`：首頁、申請、我的申請、待我簽核、稽核紀錄）；員工管理頁（`admin.html`）。沒有行內腳本與樣式，內容安全政策才能收緊。和展示版（`ltc-portal.html`，放在 GitHub Pages）完全分開
- `server/requests.js`、`server/leave-rules.js`：請假、加班、補打卡與簽核 API（`/api/leave`、`/api/overtime`、`/api/punch-fix`、`/api/requests`、`/api/requests/inbox`、`/api/requests/:id/approve|reject|withdraw|cancel`、`/api/leave/balance`）；設計說明見 `docs/learn/03-requests-design.md`
- `Dockerfile`：打包成容器

## 本機執行
```bash
npm install
npm run test:unit        # 後端測試（含資料庫，用 PGlite，不用另外裝資料庫）
npm run server:dev       # 開 http://localhost:8080 ：假登入（manager@example.test、hr@example.test、a@example.test＝員工、admin@example.test）
                         # 登入後是 /app.html；員工管理頁 /admin.html
                         # 會自動寫入虛構示範員工；資料只在記憶體，重啟就清空
```

## 環境變數
| 名稱 | 說明 | 正式環境 |
|---|---|---|
| `DATABASE_URL` | PostgreSQL 連線字串（Cloud SQL） | 必填 |
| `SESSION_SECRET` | 簽 cookie 用的密鑰，至少 32 字元，**不能放進程式庫** | 必填（放 Secret Manager） |
| `GOOGLE_CLIENT_ID` | Google OAuth 用戶端 ID | 必填 |
| `ALLOWED_DOMAIN` | 只允許這個 Google Workspace 網域登入（例如公司網域） | 建議必填 |
| `ALLOWED_ORIGINS` | 網頁網址（逗號分隔），擋跨站請求 | 必填 |
| `TRUSTED_HOPS` | 伺服器前面有幾層可信任的代理（決定怎麼讀真實 IP，要實測） | 必填 |
| `BOOTSTRAP_ADMIN_EMAIL` | 第一位系統管理員（員工名冊是空的時才建立一次） | 只有第一次部署 |
| `DEV_LOGIN` | 假登入，只在非正式環境有效 | 不要設（設了會拒絕啟動） |

## 上線
要你操作的部分、一鍵建置腳本、部署流程、費用與資安設計，都在 `docs/DEPLOY.md`；勾選清單在 `docs/GCP_CHECKLIST.md`；備份還原與維運在 `docs/RUNBOOK.md`。

## 下一步（我來寫）
員工資料與請假、加班、簽核的 API；網頁前端改成呼叫 API（目前網站的資料還在瀏覽器）；匯入 104 與仁寶的正式流程；備份腳本與監控；更多伺服器端權限規則。

## 用真實 Google 登入測試（本機，用個人測試專案、虛構資料）
1. 在 Google Cloud 測試專案建立 OAuth 用戶端 ID（網頁應用程式），「已授權的 JavaScript 來源」加入 `http://localhost:8080`；同意畫面保持「測試中」，把你的 Gmail 加進測試使用者。
2. 在 repo 資料夾執行：`GOOGLE_CLIENT_ID=你的用戶端ID SEED=1 DEV_LOGIN=1 node server/index.js`
3. 因為登入用 email 對到員工，先把你的測試 Gmail 加成員工：用假登入以 `manager@example.test` 進 `/admin.html` 新增，或改 `server/seed.js` 的示範 email。
4. 開 http://localhost:8080 ，按「用 Google 登入」。
**正式環境不要設 `DEV_LOGIN`，也不要用個人專案放真實員工資料。**

## 仁寶匯入與儀表板（/api/svc）
- `POST /api/svc/imports`：瀏覽器解析後只送彙總（需「居服個案」可編輯）；取代同月份舊資料；稽核 `svc_import`。
- `GET /api/svc/imports`、`/months`、`/dashboard?month=`、`/workers?month=&day=`（需可檢視）。
- `GET /api/svc/pay?month=&plan=A|B`：拆帳制計薪草稿（需薪資權限；稽核 `svc_pay_view`）；給付表在 `server/svc-config.json`。
- 網頁：`#/svc`（儀表板）、`#/svc/workers`、`#/svc/import`、`#/svc/pay`；解析程式 `web/svc-parse.js` 與展示版同源。

## 牛津居家時薪制（/api/pay/hourly）
- 權限：看＝薪資權限＋頁面 `pay.run` 不是「不可」；改規則、匯入、代扣、刪除＝薪資權限＋`pay.run` 為「可編輯」（目前只有人資）；較早到職勾選＝`editEmp`＋薪資權限。
- `GET /rules?month=` 取得該月適用的規則與版本列表；`PUT /rules` 新增版本 `{effectiveFrom, config}`（檢查：級距由小到大、倍率與金額範圍、進位方式；日別與時段固定）。
- `POST /rows` `{month, mode: upsert|replace, rows}` 匯入每月輸入（最多 600 人；工號、分鐘、金額逐項檢查）；`PUT /deductions` 更新代扣（回報名單裡沒有的工號）；`DELETE /rows/:month/:empNo`；`PUT /early/:id` 勾選較早到職。
- `GET /results?month=` 依該月適用的規則計算；名冊裡有這個工號就用員工資料的勾選。每次變更與查看都寫稽核紀錄（`pay_rules_change`、`pay_rows_import`、`pay_deductions_import`、`pay_row_delete`、`pay_early_tier`、`pay_hourly_view`）。
- 資料表在 `server/migrations/006_hourly_pay.sql`。網頁：`#/pay`、`#/pay/import`、`#/pay/rules`；解析程式在 `web/svc-parse.js`。

### 用仁寶服務紀錄算分鐘數（/api/pay/hourly）
- `GET /from-svc?month=&withAA=1` 預覽；`POST /from-svc {month, withAA}` 寫入（只更新服務分鐘、加班分鐘與選擇帶入的 AA 次數）；`PUT /daytype-map {label, type}` 歸類加班類型標籤；`PUT /name-map {worker, empNo}` 指定仁寶姓名的員編。全部需要能改薪資的權限，並寫稽核紀錄。
- 切小時的規則在 `server/hourly-split.js`（純函式）；資料表 `007_hourly_from_svc.sql`。仁寶匯入的彙總多了 `who[姓名].byLabel[日期][標籤]`（分鐘）。

### 薪資單（/api/pay/hourly 與 /api/payslips）
- 人資（可編輯薪資試算）：`POST /publish {month, acknowledgeWarnings}` 發布並鎖定（存快照）；`POST /reopen {month, reason}` 退回（原因至少 5 字）；`GET /payslips?month=` 全部、`GET /payslip?month=&empNo=` 單張（可檢視者也能看）；`GET /events` 發布與退回紀錄。已發布的月份，`/rows`、`/deductions`、刪除、`/from-svc` 都回 409 `month_published`。
- 員工：`GET /api/payslips/mine`、`GET /api/payslips/mine/:month`（只有自己、已發布）。
- 網頁：`/payslip.html?month=&emp=`（單張）、`&all=1`（全部）、`&mine=1`（員工自己的）；資料表 `008_payslips.sql`。

## 拆帳制（/api/pay/split）
- 權限同時薪制。`GET /rules?month=`、`PUT /rules`（給付表、業績獎金區間、偏鄉津貼、加項或扣項，有生效月份）；`POST /rows`（方案與加扣項）、`PUT /deductions`、`DELETE /rows/:month/:empNo`；`GET /results?month=`（對不到員編的列在 `unmatched`）；`/payslips`、`/payslip`、`/publish`、`/reopen`、`/events` 與時薪制相同（`server/pay-months.js`）。
- 引擎在 `server/split-engine.js`（純函式）；預設規則取自 `server/svc-config.json`；員工自己的薪資單用 `GET /api/payslips/mine/:month?kind=split`。網頁：`#/split`、`#/split/import`、`#/split/rules`；薪資單 `/payslip.html?kind=split&...`。

## 月薪制薪資資料（/api/pay/salary）
- 權限同其他薪資功能（看＝薪資權限＋`pay.run` 不是「不可」；改＝該頁可編輯，目前只有人資）。
- `GET /?asOf=` 某天適用的底薪與專業加給（含未登錄的人與提醒）；`GET /history/:empNo`；`GET /segments/:empNo?month=` 月內分段（按天數）；`POST /entries {empNo, kind: hire|raise|correction, effectiveFrom, baseSalary, professionalAllowance, reason, correctsId?}`；`POST /import {rows, reason}` 整份一起成功。
- 引擎在 `server/salary-engine.js`（純函式）；資料表 `010_salary.sql`，觸發器擋修改與刪除。網頁：`#/salary`、`#/salary/import`。
