# 上線說明（Google Cloud）

> 這份是給「拿到公司的 Google Cloud 帳號之後，要一次上線」的人。要你做的事和決定都整理成勾選清單：`docs/GCP_CHECKLIST.md`。出事怎麼辦、備份怎麼還原：`docs/RUNBOOK.md`。

## 架構（每個零件做什麼）
```
員工的手機／電腦 ──HTTPS──▶ Cloud Run（容器：網站＋API）──Cloud SQL 連接器──▶ Cloud SQL（PostgreSQL 16）
                                  │  ▲                                              │
                      Secret Manager（資料庫連線、密鑰）                  每日自動備份＋時間點還原
                                                                                    │
GitHub（程式庫）─ GitHub Actions ─(免金鑰登入)─▶ Artifact Registry（映像）          └─每週匯出 ─▶ Cloud Storage（私有，保留 90 天）
                                                                          Cloud Scheduler 每週日 04:00（台北）觸發匯出
```
- **Cloud Run**：跑我們的容器，用多少算多少；新版本先不接流量、測過才切過去，壞了可以一行指令回到上一版。
- **Cloud SQL**：正式資料庫（PostgreSQL 16，台灣 asia-east1），有刪除保護、每日備份保留 14 份、時間點還原 7 天。
- **Secret Manager**：資料庫連線字串與工作階段密鑰（隨機產生，不會顯示、不進程式庫）。
- **Artifact Registry**：存容器映像。**Cloud Storage**：兩個私有儲存桶 —— 每週一份完整匯出（與 Cloud SQL 自己的備份是兩層），以及附件儲存桶（診斷證明、政府公告 PDF 原始檔；只有執行用服務帳號能讀寫，`setup.sh` 建立，名稱預設「專案ID-zengxin-files」，伺服器用 `STORAGE_DRIVER=gcs`＋`STORAGE_BUCKET` 連它）。
- **GitHub Actions ↔ Google**：用 Workload Identity Federation，**不用下載任何金鑰檔**；只有本程式庫的 `main` 分支能部署。

## 從零到上線（約半天，大部分是等）
| 步驟 | 誰 | 做什麼 | 指令或位置 |
|---|---|---|---|
| 1 | 老闆／IT | 決定幾件事（專案擁有者、網址、網域、預算） | `GCP_CHECKLIST.md` 第 A 區 |
| 2 | 專案負責人 | 在公司帳號下建專案、連結帳單、加第二位擁有者 | 主控台，`GCP_CHECKLIST.md` 第 B 區 |
| 3 | 專案負責人 | 在 Cloud Shell 跑一鍵建置（先 `DRY_RUN=1` 預覽） | `scripts/gcp/setup.sh` |
| 4 | 專案負責人 | 建 OAuth 用戶端（Google 登入），取得用戶端 ID | 主控台，`GCP_CHECKLIST.md` 第 D 區 |
| 5 | 專案負責人 | 在 GitHub 填變數、設部署核准人 | `GCP_CHECKLIST.md` 第 E 區 |
| 6 | 自動 | 按「Run workflow」：建映像 → 部署 → 煙霧測試 | `.github/workflows/deploy-cloudrun.yml` |
| 7 | 專案負責人 | 用第一位管理員登入、匯入員工、跑一次還原演練 | `RUNBOOK.md` |

## 設定值（環境變數）
| 名稱 | 說明 | 從哪裡來 |
|---|---|---|
| `DATABASE_URL` | PostgreSQL 連線字串（Cloud SQL 連接器的 unix socket 格式） | Secret Manager `zengxin-database-url`（setup.sh 產生） |
| `SESSION_SECRET` | 簽 cookie 的密鑰，至少 32 字元 | Secret Manager `zengxin-session-secret`（setup.sh 產生） |
| `GOOGLE_CLIENT_ID` | OAuth 用戶端 ID（不是祕密） | GitHub 變數 `PORTAL_GOOGLE_CLIENT_ID` |
| `ALLOWED_DOMAIN` | 只允許這個 Google Workspace 網域登入 | GitHub 變數 `PORTAL_ALLOWED_DOMAIN` |
| `ALLOWED_ORIGINS` | 網站網址（https），擋跨站請求 | GitHub 變數 `PORTAL_URL` |
| `TRUSTED_HOPS` | 伺服器前面有幾層可信任的代理（決定打卡怎麼讀真實 IP） | GitHub 變數 `PORTAL_TRUSTED_HOPS`，**要用辦公室實測** |
| `BOOTSTRAP_ADMIN_EMAIL` | 第一位系統管理員的 email（員工名冊是空的時才建立一次，之後沒作用） | GitHub 變數 `PORTAL_BOOTSTRAP_ADMIN_EMAIL`（只有第一次部署需要） |
| `DEV_LOGIN` | 假登入 | **不能設**（正式環境設了會拒絕啟動） |

**正式環境缺任何一個必要設定，伺服器會一次列出全部缺的並拒絕啟動**（不會帶著不安全的設定上線）。

## 費用（粗估，以 Google Cloud 價格計算機為準）
| 項目 | 每月 |
|---|---|
| Cloud SQL（db-g1-small，10 GB SSD，單區） | 約 US$ 28–35 |
| Cloud Run（常駐 1 個實例，300 人的內部系統） | 約 US$ 5–12 |
| Artifact Registry、Secret Manager、Cloud Storage、Scheduler | 合計不到 US$ 3 |
| **合計** | **約 US$ 35–50（約 NT$ 1,100–1,600）** |

可以降低：`MIN_INSTANCES=0`（第一個請求會慢約 1 秒）。可以提高可用性：Cloud SQL 改「高可用」（費用約 2 倍）。已設預算提醒（50%、90%、100%）。

## 資安設計（為什麼這樣做）與已知限制
- **沒有金鑰檔**：GitHub 用 Workload Identity Federation；Cloud Run 用服務帳號；祕密在 Secret Manager。
- **權限最小化**：執行用、部署用、排程用三個服務帳號，各自只有需要的權限（沒有人用「擁有者」或「編輯者」角色在跑服務）。
- **只有公司網域的人能登入**，而且 email 要對得到員工名冊；離職或停用的人立刻失效；伺服器自己判斷權限，不靠畫面。
- **傳輸與瀏覽器**：HTTPS 強制（HSTS）、嚴格 CSP（不准內嵌腳本）、不能被別的網站嵌入、跨站請求檢查。
- **資料**：資料庫備份兩層、刪除保護；薪資歷史與簽核紀錄只能新增（資料庫觸發器擋修改與刪除）；稽核紀錄不記薪資金額。
- **測試**：整套後端測試也對真正的 PostgreSQL 16 跑一次；CI 會真的建映像、以正式模式啟動、跑煙霧測試、確認收到停止訊號會乾淨結束。
- **已知限制（要知道，不是忘了）**：①登入失敗的限流是「每個實例各自計算」（實例多時上限會變高）；②Cloud SQL 目前用連接器走公網入口（沒有開放任何授權網路），之後可以改私有 IP；③還沒有 WAF（Cloud Armor）與滲透測試；④個資告知同意書、資料保存與刪除政策還沒定案；⑤還沒有集中的異常告警（見 `RUNBOOK.md` 的監控建議）。
