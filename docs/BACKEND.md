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
- `Dockerfile`：打包成容器

## 本機執行
```bash
npm install
npm run test:unit        # 後端測試（含資料庫，用 PGlite，不用另外裝資料庫）
npm run server:dev       # http://localhost:8080 ，DEV_LOGIN=1 可用 /auth/dev-login 假登入
DEV_LOGIN=1 node server/seed.js   # 寫入虛構示範員工（只有用檔案型資料庫時才留得住，見 PGLITE_DIR）
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
| `DEV_LOGIN` | 假登入，只在非正式環境有效 | 不要設 |

## 要你操作的部分（我沒有你的帳號與付款權限）
1. **建 Google Cloud 專案**（建議兩個：`zengxin-test`、`zengxin-prod`），開啟帳單與預算提醒。
2. **建 Cloud SQL（PostgreSQL）**：先選最小規格，區域選台灣（asia-east1），開啟每日自動備份與時間點還原。
3. **建 OAuth 用戶端**：APIs & Services → Credentials → OAuth client ID（Web），把網頁網址加入授權來源，取得 `GOOGLE_CLIENT_ID`。
4. **Secret Manager** 放 `SESSION_SECRET` 與資料庫密碼。
5. **部署到 Cloud Run**：`gcloud run deploy zengxin-api --source . --region asia-east1`，設定上面的環境變數，連上 Cloud SQL。
6. 做一次**還原演練**：把備份還原到一個新的資料庫，確認資料回得來。

## 下一步（我來寫）
員工資料與請假、加班、簽核的 API；網頁前端改成呼叫 API（目前網站的資料還在瀏覽器）；匯入 104 與仁寶的正式流程；備份腳本與監控；更多伺服器端權限規則。
