# 誠馨長照營運入口 v2.0
# Zengxin Operations Portal v2.0

**互動式原型** — 討論用系統，用於確定關鍵決策（院長跨院權限、管理員薪資可見性、請假簽核流程）。

**Discussion prototype** — visualize three architectural decisions before full development.

## 使用方式 / Getting Started

1. 用瀏覽器開啟 `ltc-portal.html`
2. Open `ltc-portal.html` in any browser
3. 無需登入、無需資料庫、無需後端

No authentication, no database, no backend required.

## 內容 / Contents

- **ltc-portal.html** — 完整互動原型 / Full interactive prototype
  - 3 個完整角色（系管、人資、院長）
  - 3 working roles (System Admin, HR Manager, Facility Director)
  - 公告、人事、權限模組
  - Announcements, HR, Permissions modules
  - 三個待決議題（可透過 ASSUMPTION 開關比較）
  - Three open questions with live toggle to compare scenarios

- **docs/ltc-portal-walkthrough.md** — 15 分鐘導覽指南
  - 如何進行 9/30 會議示範
  - Meeting walkthrough guide (15 min)

## 決策架構 / Decision Framework

| 問題 | 預設 | 影響 |
|-----|------|------|
| **Q1** 院長可跨院查看？ | 否（單院） | 隱私 vs. 靈活排班 |
| **Q2** 管理員看薪資？ | 否（隱藏） | 流程控制 vs. 技術隔離 |
| **Q3** 請假需複核？ | 是（兩層） | 控管 vs. 速度 |

## 開發階段 / Roadmap

- **Phase 1** (Sept): 原型決策 / Prototype & decisions
- **Phase 2** (Nov–Dec): 薪資、報表、擴展到台中 / Payroll, reports, expand to Taichung
- **Phase 3** (2027 Q1): 個案管理、擴展到彰化 / Case management, expand to Changhua

## 當前範圍 / Current Scope

- **設施**: 新竹竹北、竹東 (2 locations)
- **員工**: 19 位示範員工 (demo staff)
- **角色**: 3 個完全功能、6 個計畫中 (3 built, 6 planned)
- **沒有**: 登入、資料庫、真實資料、持久化
- **No**: authentication, database, real data, persistence

---

Made with User + AI tools.  
v2.0 · Sept 2026
