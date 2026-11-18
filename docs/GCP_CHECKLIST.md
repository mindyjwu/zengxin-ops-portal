# Google Cloud 設定清單（拿到帳號後照著做）

勾選用。「誰」：**老闆／IT**＝要決定或有權限的人；**負責人**＝專案負責人；**自動**＝腳本或 GitHub 做。

## A. 先決定（還沒有就先別建專案）
- [ ] **公司擁有的 Google Cloud 組織與專案擁有者**（老闆／IT）：專案必須掛在公司的 Google Workspace 帳號下，**不是個人 Gmail**。至少 2 位擁有者（避免一個人離職就鎖死）。
- [ ] **帳單**（老闆）：用公司的付款方式；每月預算上限（建議先設 NT$3,000，超過 50%、90%、100% 通知）。
- [ ] **區域**：台灣 `asia-east1`（預設，資料留在台灣）。
- [ ] **網址**：先用 Cloud Run 給的網址測試；正式要用公司網域（例如 `portal.公司網域`）時，誰管 DNS？
- [ ] **Google Workspace 網域**（IT）：只有這個網域的帳號能登入（例如 `公司網域.com`）。
- [ ] **全職維護者**（老闆）：誰收到告警、誰做每月檢查（`RUNBOOK.md`）。
- [ ] **備份目標**：建議「資料最多損失 24 小時（每日備份）、通常只損失幾分鐘（時間點還原 7 天）」；還原時間約 1–2 小時。
- [ ] **辦公室打卡怎麼判斷**（IT）：固定對外 IP（建議）、浮動 IP＋DDNS、或 QR 碼；見 `PUNCH_IP_SPEC.md`。

## B. 建專案（約 30 分，負責人在主控台做）
- [ ] 用公司帳號登入 console.cloud.google.com，建立專案，專案 ID 例如 `zengxin-prod`（建議另建 `zengxin-test` 先演練一次）。
- [ ] 連結帳單帳戶。
- [ ] IAM：加第二位「擁有者」；所有擁有者開啟兩步驟驗證。
- [ ] 啟用組織政策或至少確認：不要建立服務帳號金鑰（本專案不需要任何金鑰檔）。

## C. 一鍵建置（約 15 分，自動；在 Cloud Shell 執行）
```bash
git clone https://github.com/mindyjwu/zengxin-ops-portal && cd zengxin-ops-portal
cp scripts/gcp/config.env.example scripts/gcp/config.env      # 填 PROJECT_ID、GITHUB_REPO、ALLOWED_DOMAIN、PORTAL_URL…
DRY_RUN=1 scripts/gcp/setup.sh                                 # 先預覽會做什麼（不會連 Google）
scripts/gcp/setup.sh                                           # 建：Cloud SQL、祕密、服務帳號、免金鑰部署、備份、排程、預算
```
- [ ] 預覽看過、實際執行成功；把最後印出的三個變數記下來（第 E 區要用）。
- [ ] 在主控台確認：Cloud SQL 有「刪除保護」、自動備份開著、時間點還原開著。

## D. Google 登入（OAuth，約 10 分）
- [ ] APIs & Services > OAuth consent screen：**使用者類型選「內部（Internal）」**（只有公司網域的帳號能用），填應用程式名稱與聯絡信箱。
- [ ] Credentials > Create credentials > OAuth client ID > **Web application**；「已授權的 JavaScript 來源」填網站網址（正式網址，測試時也加 Cloud Run 給的網址）。
- [ ] 複製**用戶端 ID**（不是祕密）→ 第 E 區的 `PORTAL_GOOGLE_CLIENT_ID`。

## E. GitHub 設定（負責人，約 10 分）
Settings > Secrets and variables > Actions > **Variables**：
- [ ] `GCP_PROJECT_ID`、`GCP_WORKLOAD_IDENTITY_PROVIDER`、`GCP_DEPLOYER_SA`（setup.sh 最後印出的）
- [ ] `PORTAL_ALLOWED_DOMAIN`、`PORTAL_URL`（https，不含結尾斜線）、`PORTAL_GOOGLE_CLIENT_ID`
- [ ] `PORTAL_TRUSTED_HOPS`（先填 1，上線後用辦公室實測）
- [ ] `PORTAL_BOOTSTRAP_ADMIN_EMAIL`（第一位系統管理員的 email，必須在上面的網域；**只有第一次部署需要**）
- [ ] Settings > Environments > `production` > **Required reviewers**：勾選一位核准人（部署前要有人按核准）
- [ ] （之後想要每次合併自動部署）新增變數 `GCP_AUTO_DEPLOY` = `true`

## F. 第一次部署與上線檢查
- [ ] GitHub > Actions > **Deploy to Cloud Run** > Run workflow（核准人按核准）。成功代表：映像建好、新版本通過煙霧測試、已接流量。
- [ ] 打開網址，用第一位管理員的 Google 帳號登入。
- [ ] 員工管理頁匯入全部員工（CSV），指派人資、主管、老闆角色。
- [ ] **移除** GitHub 變數 `PORTAL_BOOTSTRAP_ADMIN_EMAIL`（之後留著也沒作用，但不留比較乾淨）。
- [ ] 用辦公室的電腦打一次卡，在後台看到的網路標示是「辦公室」；不是的話調整 `PORTAL_TRUSTED_HOPS`（1 或 2）再部署。
- [ ] 用一個「不在名冊」的公司帳號登入：要被拒絕；用個人 Gmail 登入：要被拒絕。
- [ ] **還原演練一次**（`RUNBOOK.md`「還原演練」），確認備份真的還原得回來。

## G. 上線後一週內
- [ ] 監控：Cloud Monitoring 建 3 個告警——① 運作時間檢查 `/readyz`（每分鐘，連續 2 次失敗通知）；② Cloud Run 5xx 錯誤率；③ Cloud SQL 磁碟使用率超過 80%。通知寄給維護者與一位備援。
- [ ] 確認每週備份真的出現在 `gs://專案-zengxin-backups/portal-weekly.sql.gz`。
- [ ] 個資告知同意書、資料保存與刪除政策（見使用指南的待確認清單）。
- [ ] 排定：每月一次檢查（`RUNBOOK.md`）、每季一次還原演練。
