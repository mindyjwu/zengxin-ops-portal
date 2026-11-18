# 維運手冊（出事怎麼辦、日常要做什麼）

以下指令在 Cloud Shell 或已登入 `gcloud` 的電腦執行；`PROJECT`、`REGION`（asia-east1）、服務名稱 `zengxin-portal`、資料庫實例 `zengxin-pg` 依實際為準。

## 1. 看狀況
```bash
curl -s https://網址/readyz                                   # {"ok":true}＝服務與資料庫都好；503＝資料庫連不上
gcloud run services logs read zengxin-portal --region asia-east1 --limit 100
gcloud run revisions list --service zengxin-portal --region asia-east1
```
後台「稽核紀錄」頁看誰做了什麼（登入、查看薪資、發布薪資單、改權限…）。

## 2. 部署與回滾
- 部署：GitHub Actions 的 **Deploy to Cloud Run**。新版本先「不接流量」並給測試網址，煙霧測試通過才切；沒通過就留在舊版本，什麼都不會壞。
- **回滾**（新版本上線後才發現有問題）：
  ```bash
  gcloud run revisions list --service zengxin-portal --region asia-east1        # 找上一版的名稱
  gcloud run services update-traffic zengxin-portal --region asia-east1 --to-revisions=上一版名稱=100
  ```
- 資料表變更採「先加後減」：新版本只**新增**欄位或資料表，不在同一次部署裡刪舊的，這樣回滾到上一版程式仍然能跑。要刪東西，等新版本穩定一週後另開一次部署。

## 3. 備份與還原
**兩層備份**
| 層 | 內容 | 保留 | 最多損失 |
|---|---|---|---|
| Cloud SQL 自動備份 | 每天 03:00（台北）整個資料庫 | 14 份 | 24 小時 |
| Cloud SQL 時間點還原 | 交易紀錄，可以回到任何一分鐘 | 7 天 | 幾分鐘 |
| 每週匯出到 Cloud Storage | `gs://專案-zengxin-backups/portal-weekly.sql.gz`（週日 04:00 台北，私有、有版本、保留 90 天） | 90 天 | 7 天 |

**還原演練（每季一次；第一次上線後立刻做一次）**——永遠還原到「新的」實例，不要動正式的：
```bash
# 1) 時間點還原：複製出一個新實例，資料回到指定時間（UTC）
gcloud sql instances clone zengxin-pg zengxin-pg-drill --point-in-time 2026-11-18T03:00:00Z
#    或用某一天的自動備份：gcloud sql backups list --instance zengxin-pg
#                          gcloud sql backups restore 備份編號 --restore-instance zengxin-pg-drill --backup-instance zengxin-pg
#    或用每週匯出：gcloud sql import sql zengxin-pg-drill gs://專案-zengxin-backups/portal-weekly.sql.gz --database portal
# 2) 用 Cloud SQL Auth Proxy 連到新實例，驗證資料
./cloud-sql-proxy 專案:asia-east1:zengxin-pg-drill --port 5433 &
DATABASE_URL="postgres://portal_app:密碼@localhost:5433/portal" node scripts/verify-restore.js --max-age-hours 36
# 3) 驗證通過（全部 ✓）就寫下日期與結果；然後刪掉演練用的實例
gcloud sql instances delete zengxin-pg-drill
```
`verify-restore.js` 檢查：建表紀錄完整、各資料表筆數、最新稽核紀錄多新（資料落後多久）、防竄改觸發器還在、已發布薪資單的數字對得起來、沒有示範資料。**任何一項 ✗ 都是要處理的問題，不要當成演練成功。**

**真的出事要還原到正式環境**：先把 Cloud Run 停止接流量（`gcloud run services update-traffic … --to-revisions=…=0` 或暫時設最大實例 0），在新實例驗證通過後，把 `zengxin-database-url` 祕密換成新實例的連線字串（新增一個版本）並重新部署；舊實例先留著幾天再刪。

## 4. 祕密輪替
- **工作階段密鑰**（懷疑外洩，或每年一次）：`openssl rand -hex 32 | gcloud secrets versions add zengxin-session-secret --data-file=-`，然後重新部署。**所有人會被登出一次，要重新登入。**
- **資料庫密碼**：`gcloud sql users set-password portal_app --instance zengxin-pg --password 新密碼`，同時用新連線字串新增 `zengxin-database-url` 的新版本，重新部署（兩步之間會有一小段時間連不上，挑下班時間）。
- 沒有任何金鑰檔需要輪替（GitHub 用 Workload Identity Federation）。

## 5. 人員與帳號事件
- 員工離職：在員工管理頁「停用」，**立刻失效**（現有的登入也會被擋）。
- 帳號被盜用的懷疑：停用該員工 → 看稽核紀錄找他做過什麼 → 必要時輪替工作階段密鑰（見上）。
- 有人看了不該看的薪資：稽核紀錄有「查看薪資」「查看薪資單」的紀錄（誰、何時、哪個月），不記金額。

## 6. 每月檢查（維護者，約 30 分）
- [ ] 每週匯出檔都在（`gcloud storage ls -l gs://專案-zengxin-backups/`）、Cloud SQL 最近的自動備份成功（`gcloud sql backups list --instance zengxin-pg`）。
- [ ] 告警有沒有觸發過、原因處理了沒；Cloud Run 與 Cloud SQL 的費用有沒有異常。
- [ ] 稽核紀錄：看「被拒絕（denied）」與「登入被拒（login_denied）」有沒有異常增加。
- [ ] 依賴套件更新（`npm audit`、基底映像 `node:22-slim` 的安全更新），有更新就走一次部署。
- [ ] 清單上有沒有該停用沒停用的帳號（離職、留職停薪）。

## 7. 監控建議（上線後一週內建好）
Cloud Monitoring：①運作時間檢查：`https://網址/readyz`，每分鐘，連續 2 次失敗就通知；②警示：Cloud Run「5xx 錯誤率」大於 1% 連續 5 分鐘；③警示：Cloud SQL「磁碟使用率」大於 80%。通知管道至少兩個人。
