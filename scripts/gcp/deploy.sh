#!/usr/bin/env bash
# 部署到 Cloud Run：scripts/gcp/deploy.sh 映像網址
# 做法：新版本先「不接流量」並給一個測試網址 → 跑煙霧測試 → 通過才把流量切過去；沒通過就留在舊版本，什麼都不會壞。
# 第一次部署（服務還不存在）直接上線再測。GitHub Actions 與手動部署用同一支。
. "$(dirname "$0")/lib.sh"; load_config
IMAGE="${1:?用法：scripts/gcp/deploy.sh 映像網址（例如 asia-east1-docker.pkg.dev/專案/zengxin/api:標籤）}"
: "${ALLOWED_DOMAIN:?要設定 ALLOWED_DOMAIN}"; : "${PORTAL_URL:?要設定 PORTAL_URL（https://...）}"; : "${GOOGLE_CLIENT_ID:?要設定 GOOGLE_CLIENT_ID}"
ENVV="^@^NODE_ENV=production@ALLOWED_DOMAIN=${ALLOWED_DOMAIN}@ALLOWED_ORIGINS=${PORTAL_URL}@GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID}@TRUSTED_HOPS=${TRUSTED_HOPS}@STORAGE_DRIVER=gcs@STORAGE_BUCKET=${FILES_BUCKET}"   # ^@^ 讓值裡可以有逗號
[ -n "${BOOTSTRAP_ADMIN_EMAIL:-}" ] && ENVV="${ENVV}@BOOTSTRAP_ADMIN_EMAIL=${BOOTSTRAP_ADMIN_EMAIL}"   # 只有第一次部署才需要（員工名冊是空的時建立第一位管理員）
COMMON=(--image "$IMAGE" --region "$REGION" --project "$PROJECT_ID" --service-account "$RUNTIME_SA" --add-cloudsql-instances "$CONNECTION"
  --set-secrets "SESSION_SECRET=zengxin-session-secret:latest,DATABASE_URL=zengxin-database-url:latest" --set-env-vars "$ENVV"
  --min-instances "$MIN_INSTANCES" --max-instances "$MAX_INSTANCES" --concurrency 80 --cpu 1 --memory 512Mi --timeout 60 --cpu-boost --port 8080 --allow-unauthenticated)
say "部署 $IMAGE"
if [ "${DRY_RUN_SERVICE_EXISTS:-0}" = 1 ] || exists gcloud run services describe "$SERVICE" --region "$REGION" --project "$PROJECT_ID"; then   # DRY_RUN_SERVICE_EXISTS=1：預覽「已經有舊版本」的流程
  run gcloud run deploy "$SERVICE" "${COMMON[@]}" --no-traffic --tag candidate
  if [ "$DRY_RUN" = 1 ]; then URL="https://${SERVICE}-<hash>-<region>.a.run.app"; else URL="$(gcloud run services describe "$SERVICE" --region "$REGION" --project "$PROJECT_ID" --format='value(status.url)')"; fi
  CAND="https://candidate---${URL#https://}"      # 標籤網址：在服務網址前面加「標籤---」
  say "煙霧測試新版本（還沒接流量）：$CAND"
  run "$(dirname "$0")/../smoke.sh" "$CAND" --https
  say "通過：把流量切到新版本"
  run gcloud run services update-traffic "$SERVICE" --region "$REGION" --project "$PROJECT_ID" --to-latest
  run gcloud run services update-traffic "$SERVICE" --region "$REGION" --project "$PROJECT_ID" --remove-tags candidate
else
  run gcloud run deploy "$SERVICE" "${COMMON[@]}"
  if [ "$DRY_RUN" = 1 ]; then URL="https://${SERVICE}-<hash>-<region>.a.run.app"; else URL="$(gcloud run services describe "$SERVICE" --region "$REGION" --project "$PROJECT_ID" --format='value(status.url)')"; fi
  run "$(dirname "$0")/../smoke.sh" "$URL" --https
fi
say "完成。回滾：gcloud run services update-traffic $SERVICE --region $REGION --to-revisions=<上一版>=100（見 docs/RUNBOOK.md）"
