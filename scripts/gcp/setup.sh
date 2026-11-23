#!/usr/bin/env bash
# 一次建好雲端環境（在 Google Cloud Shell 執行，用有「擁有者」權限的帳號）。可以重複執行：已經存在的會略過。
# 先用 DRY_RUN=1 scripts/gcp/setup.sh 看會做什麼。做完會印出要貼到 GitHub 的三個變數。
. "$(dirname "$0")/lib.sh"; load_config
say "專案與服務"
run gcloud config set project "$PROJECT_ID"
run gcloud services enable run.googleapis.com sqladmin.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com \
  cloudscheduler.googleapis.com storage.googleapis.com iam.googleapis.com iamcredentials.googleapis.com sts.googleapis.com cloudresourcemanager.googleapis.com monitoring.googleapis.com logging.googleapis.com

say "容器映像倉庫"
exists gcloud artifacts repositories describe "$AR_REPO" --location "$REGION" || run gcloud artifacts repositories create "$AR_REPO" --repository-format=docker --location "$REGION" --description="誠馨入口的容器映像"

say "服務帳號（執行用、部署用、排程用）：各自只給需要的權限"
for sa in zengxin-run:"誠馨入口執行用" zengxin-deployer:"GitHub Actions 部署用" zengxin-scheduler:"排程備份用"; do
  exists gcloud iam service-accounts describe "${sa%%:*}@${PROJECT_ID}.iam.gserviceaccount.com" || run gcloud iam service-accounts create "${sa%%:*}" --display-name="${sa#*:}"
done

say "Cloud SQL（PostgreSQL 16）：每日自動備份保留 14 份、時間點還原 7 天、刪除保護"
exists gcloud sql instances describe "$SQL_INSTANCE" || run gcloud sql instances create "$SQL_INSTANCE" --database-version=POSTGRES_16 --edition=ENTERPRISE --tier="$SQL_TIER" --region="$REGION" \
  --storage-type=SSD --storage-size=10 --storage-auto-increase --availability-type=zonal \
  --backup-start-time=19:00 --retained-backups-count=14 --enable-point-in-time-recovery --retained-transaction-log-days=7 \
  --maintenance-window-day=SUN --maintenance-window-hour=19 --deletion-protection
exists gcloud sql databases describe "$DB_NAME" --instance "$SQL_INSTANCE" || run gcloud sql databases create "$DB_NAME" --instance "$SQL_INSTANCE"

say "祕密（Secret Manager）：資料庫密碼與工作階段密鑰由這裡隨機產生，不會顯示在畫面上，也不會進程式庫"
if ! exists gcloud secrets describe zengxin-database-url; then
  if [ "$DRY_RUN" = 1 ]; then
    echo "+ (產生隨機資料庫密碼 → 設定資料庫使用者 $DB_USER → 把連線字串存成祕密 zengxin-database-url；值不顯示)"
  else
    PW="$(openssl rand -hex 24)"
    if [ -n "$(gcloud sql users list --instance "$SQL_INSTANCE" --filter="name=$DB_USER" --format='value(name)')" ]; then gcloud sql users set-password "$DB_USER" --instance "$SQL_INSTANCE" --password "$PW" >/dev/null; else gcloud sql users create "$DB_USER" --instance "$SQL_INSTANCE" --password "$PW" >/dev/null; fi
    printf 'postgres://%s:%s@/%s?host=/cloudsql/%s' "$DB_USER" "$PW" "$DB_NAME" "$CONNECTION" | gcloud secrets create zengxin-database-url --replication-policy=automatic --data-file=- >/dev/null
    unset PW
  fi
fi
if ! exists gcloud secrets describe zengxin-session-secret; then
  if [ "$DRY_RUN" = 1 ]; then echo "+ (產生 64 字元隨機密鑰 → 存成祕密 zengxin-session-secret；值不顯示)"; else openssl rand -hex 32 | gcloud secrets create zengxin-session-secret --replication-policy=automatic --data-file=- >/dev/null; fi
fi
for s in zengxin-database-url zengxin-session-secret; do runq gcloud secrets add-iam-policy-binding "$s" --member="serviceAccount:$RUNTIME_SA" --role=roles/secretmanager.secretAccessor; done

say "權限"
runq gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:$RUNTIME_SA" --role=roles/cloudsql.client --condition=None
runq gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:$DEPLOYER_SA" --role=roles/run.admin --condition=None
runq gcloud artifacts repositories add-iam-policy-binding "$AR_REPO" --location "$REGION" --member="serviceAccount:$DEPLOYER_SA" --role=roles/artifactregistry.writer
runq gcloud iam service-accounts add-iam-policy-binding "$RUNTIME_SA" --member="serviceAccount:$DEPLOYER_SA" --role=roles/iam.serviceAccountUser

say "GitHub Actions 免金鑰部署（Workload Identity Federation）：只有 ${GITHUB_REPO:-（未設定 GITHUB_REPO）} 的 main 分支能部署"
: "${GITHUB_REPO:=OWNER/REPO}"
exists gcloud iam workload-identity-pools describe github --location=global || run gcloud iam workload-identity-pools create github --location=global --display-name="GitHub Actions"
exists gcloud iam workload-identity-pools providers describe github-actions --location=global --workload-identity-pool=github || run gcloud iam workload-identity-pools providers create-oidc github-actions \
  --location=global --workload-identity-pool=github --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref" \
  --attribute-condition="assertion.repository=='${GITHUB_REPO}' && assertion.ref=='refs/heads/main'"
if [ "$DRY_RUN" = 1 ]; then PROJECT_NUMBER="<專案編號>"; else PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"; fi
runq gcloud iam service-accounts add-iam-policy-binding "$DEPLOYER_SA" --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/github/attribute.repository/${GITHUB_REPO}"

say "附件與檔案：私有的 Cloud Storage 儲存桶（診斷證明、政府公告 PDF 原始檔）；只有執行用服務帳號能讀寫，不開放公開存取"
exists gcloud storage buckets describe "gs://$FILES_BUCKET" || run gcloud storage buckets create "gs://$FILES_BUCKET" --location="$REGION" --uniform-bucket-level-access --public-access-prevention
runq gcloud storage buckets add-iam-policy-binding "gs://$FILES_BUCKET" --member="serviceAccount:$RUNTIME_SA" --role=roles/storage.objectUser

say "備份：每週把整個資料庫匯出到私有的 Cloud Storage（保留 90 天），與 Cloud SQL 自動備份是兩層"
exists gcloud storage buckets describe "gs://$BACKUP_BUCKET" || run gcloud storage buckets create "gs://$BACKUP_BUCKET" --location="$REGION" --uniform-bucket-level-access --public-access-prevention
runq gcloud storage buckets update "gs://$BACKUP_BUCKET" --versioning
if [ "$DRY_RUN" = 1 ]; then echo "+ (寫入 lifecycle：非現行版本超過 90 天就刪除)"; else
  LC="$(mktemp)"; printf '{"rule":[{"action":{"type":"Delete"},"condition":{"daysSinceNoncurrentTime":90,"isLive":false}}]}' > "$LC"; gcloud storage buckets update "gs://$BACKUP_BUCKET" --lifecycle-file="$LC" >/dev/null; rm -f "$LC"
fi
if [ "$DRY_RUN" = 1 ]; then SQL_SA="<Cloud SQL 的服務帳號>"; else SQL_SA="$(gcloud sql instances describe "$SQL_INSTANCE" --format='value(serviceAccountEmailAddress)')"; fi
runq gcloud storage buckets add-iam-policy-binding "gs://$BACKUP_BUCKET" --member="serviceAccount:$SQL_SA" --role=roles/storage.objectAdmin
exists gcloud iam roles describe zengxinSqlExport --project "$PROJECT_ID" || run gcloud iam roles create zengxinSqlExport --project "$PROJECT_ID" --title="只能匯出 Cloud SQL" --permissions=cloudsql.instances.export,cloudsql.instances.get
runq gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:$SCHEDULER_SA" --role="projects/${PROJECT_ID}/roles/zengxinSqlExport" --condition=None
EXPORT_BODY="{\"exportContext\":{\"fileType\":\"SQL\",\"uri\":\"gs://${BACKUP_BUCKET}/portal-weekly.sql.gz\",\"databases\":[\"${DB_NAME}\"]}}"
JOB_ARGS=(--location "$REGION" --schedule="0 4 * * 0" --time-zone="Asia/Taipei" --uri="https://sqladmin.googleapis.com/v1/projects/${PROJECT_ID}/instances/${SQL_INSTANCE}/export" --http-method=POST \
  --oauth-service-account-email="$SCHEDULER_SA" --message-body="$EXPORT_BODY")
if exists gcloud scheduler jobs describe zengxin-weekly-export --location "$REGION"; then
  run gcloud scheduler jobs update http zengxin-weekly-export "${JOB_ARGS[@]}" --update-headers="Content-Type=application/json"
else
  run gcloud scheduler jobs create http zengxin-weekly-export "${JOB_ARGS[@]}" --headers="Content-Type=application/json"
fi

if [ -n "${BILLING_ACCOUNT:-}" ]; then
  say "預算提醒（超過 50%、90%、100% 通知帳單管理員）"
  run gcloud billing budgets create --billing-account="$BILLING_ACCOUNT" --display-name="誠馨入口每月預算" --budget-amount="${BUDGET_AMOUNT:-3000TWD}" \
    --filter-projects="projects/${PROJECT_ID}" --threshold-rule=percent=0.5 --threshold-rule=percent=0.9 --threshold-rule=percent=1.0
fi

say "完成。到 GitHub 程式庫 Settings > Secrets and variables > Actions > Variables 新增："
echo "  GCP_PROJECT_ID = ${PROJECT_ID}"
echo "  GCP_WORKLOAD_IDENTITY_PROVIDER = projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/github/providers/github-actions"
echo "  GCP_DEPLOYER_SA = ${DEPLOYER_SA}"
echo "  PORTAL_ALLOWED_DOMAIN / PORTAL_URL / PORTAL_GOOGLE_CLIENT_ID / PORTAL_TRUSTED_HOPS（見 docs/DEPLOY.md 第 6 步）"
