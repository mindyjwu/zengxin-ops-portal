#!/bin/bash
# 產生「只放網站」的公開發布版（給免費的 GitHub Pages 用）。
# 用法：scripts/build-site.sh 輸出資料夾 新repo名稱
# 公開版不含：文件、測試、歷史；並把同事姓名換成職稱。
set -e
OUT="$1"; REPO="${2:-zengxin-portal-site}"
[ -n "$OUT" ] || { echo "用法：$0 輸出資料夾 [repo名稱]"; exit 1; }
mkdir -p "$OUT/icons" "$OUT/.github/workflows"
cp ltc-portal.html guide.html mobile.html index.html demo.html manifest.webmanifest sw.js "$OUT/"
cp icons/* "$OUT/icons/"
cp .github/workflows/deploy.yml "$OUT/.github/workflows/deploy.yml"
cd "$OUT"
sed -i "s#主席：吳培滋 | 紀錄：劉思慧#主席：老闆 | 紀錄：系統管理員#" index.html
sed -i "s#const REAL_NAMES={[^}]*};#const REAL_NAMES={H001:'老闆', H002:'管理者', H005:'系統管理員'};#" ltc-portal.html
sed -i "s#讓 Mindy 截圖#讓專案負責人截圖#" guide.html
sed -i "s#/zengxin-ops-portal/#/$REPO/#g" guide.html mobile.html ltc-portal.html index.html demo.html manifest.webmanifest sw.js
if grep -rIl -e '吳培滋' -e '黃千育' -e '莊啟聖' -e '劉思慧' -e 'zengxin-ops-portal' . ; then echo "公開版還有不該公開的內容，已停止"; exit 1; fi
echo "完成：$OUT"
