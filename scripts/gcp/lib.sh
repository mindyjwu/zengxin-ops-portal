# 共用小工具：DRY_RUN=1 時只印出會執行的指令（不連 Google、不產生祕密），方便先檢查。
set -euo pipefail
DRY_RUN="${DRY_RUN:-0}"
say() { printf '\n== %s\n' "$*"; }
run() { if [ "$DRY_RUN" = 1 ]; then printf '+ %s\n' "$*"; else "$@"; fi; }
# 同 run，但不顯示指令的輸出（權限綁定這類的輸出很長又沒用）
runq() { if [ "$DRY_RUN" = 1 ]; then printf '+ %s\n' "$*"; else "$@" >/dev/null; fi; }
# 檢查資源是否已存在：DRY_RUN 一律當作還不存在（這樣可以看到完整流程）
exists() { if [ "$DRY_RUN" = 1 ]; then return 1; else "$@" >/dev/null 2>&1; fi; }
load_config() {
  local f="${CONFIG:-$(dirname "${BASH_SOURCE[0]}")/config.env}"
  if [ -f "$f" ]; then set -a; . "$f"; set +a; fi
  : "${PROJECT_ID:?請先設定 PROJECT_ID（複製 scripts/gcp/config.env.example 成 config.env 後填寫，或用環境變數）}"
  REGION="${REGION:-asia-east1}"; SERVICE="${SERVICE:-zengxin-portal}"; SQL_INSTANCE="${SQL_INSTANCE:-zengxin-pg}"; DB_NAME="${DB_NAME:-portal}"; DB_USER="${DB_USER:-portal_app}"
  AR_REPO="${AR_REPO:-zengxin}"; RUNTIME_SA="zengxin-run@${PROJECT_ID}.iam.gserviceaccount.com"; DEPLOYER_SA="zengxin-deployer@${PROJECT_ID}.iam.gserviceaccount.com"; SCHEDULER_SA="zengxin-scheduler@${PROJECT_ID}.iam.gserviceaccount.com"
  BACKUP_BUCKET="${BACKUP_BUCKET:-${PROJECT_ID}-zengxin-backups}"; CONNECTION="${PROJECT_ID}:${REGION}:${SQL_INSTANCE}"
  MIN_INSTANCES="${MIN_INSTANCES:-1}"; MAX_INSTANCES="${MAX_INSTANCES:-4}"; TRUSTED_HOPS="${TRUSTED_HOPS:-1}"; SQL_TIER="${SQL_TIER:-db-g1-small}"
}
