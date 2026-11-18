#!/usr/bin/env bash
# 部署後的煙霧測試：用法 scripts/smoke.sh https://網址 [--https]
# 檢查：活著、資料庫連得上、登入頁與網站靜態檔在、設定正確（正式環境沒有假登入）、API 要登入、安全標頭。任何一項不對就結束並回傳非 0。
set -euo pipefail
BASE="${1:?用法：scripts/smoke.sh https://網址 [--https]}"; BASE="${BASE%/}"; HTTPS="${2:-}"
fail() { echo "✗ $1" >&2; exit 1; }
ok() { echo "✓ $1"; }
code() { curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$@"; }
TRIES="${SMOKE_TRIES:-30}"   # 每次間隔 2 秒；服務剛啟動時多等一下
for i in $(seq 1 "$TRIES"); do [ "$(code "$BASE/readyz" || true)" = "200" ] && break; [ "$i" = "$TRIES" ] && fail "$BASE/readyz 一直不是 200（資料庫連不上？）"; sleep 2; done
ok "/readyz 200（服務與資料庫都好）"
[ "$(code "$BASE/healthz")" = "200" ] || fail "/healthz 不是 200"; ok "/healthz 200"
[ "$(code "$BASE/")" = "200" ] || fail "登入頁打不開（映像裡沒有 web/？）"; ok "登入頁 200"
[ "$(code "$BASE/app.html")" = "200" ] || fail "app.html 打不開"; ok "app.html 200"
CFG="$(curl -s --max-time 10 "$BASE/auth/config")"
echo "$CFG" | grep -q '"devLogin":false' || fail "假登入沒有關（$CFG）"; ok "假登入已關"
echo "$CFG" | grep -Eq '"googleClientId":"[^"]+"' || fail "GOOGLE_CLIENT_ID 沒設定（$CFG）"; ok "Google 登入已設定"
[ "$(code "$BASE/api/me")" = "401" ] || fail "沒登入的 /api/me 應該是 401"; ok "沒登入的 API 回 401"
EVIL="$(code -X POST -H 'Content-Type: application/json' -H 'Origin: https://evil.example' -d '{}' "$BASE/api/punch")"
{ [ "$EVIL" = "403" ] || [ "$EVIL" = "401" ]; } || fail "外來網站的請求沒有被擋（回 $EVIL）"; ok "外來網站的請求被擋"
H="$(curl -sI --max-time 10 "$BASE/healthz")"
echo "$H" | grep -qi '^x-content-type-options: nosniff' || fail "缺少 X-Content-Type-Options"; echo "$H" | grep -qi "frame-ancestors 'none'" || fail "缺少 CSP frame-ancestors"; ok "安全標頭在"
if [ "$HTTPS" = "--https" ]; then echo "$H" | grep -qi '^strict-transport-security:' || fail "缺少 HSTS"; ok "HSTS 在"; fi
echo "煙霧測試通過：$BASE"
