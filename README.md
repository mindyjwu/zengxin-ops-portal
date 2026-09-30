# 誠馨日照營運入口 v2.2
# Zengxin Day Care Operations Portal v2.2

**互動式原型** — 討論用系統，用於確定關鍵決策（中心主任跨據點權限、管理員薪資可見性、請假簽核流程）。

**Discussion prototype** — visualize three architectural decisions before full development.

## 使用方式 / Getting Started

1. 用瀏覽器開啟 `ltc-portal.html`
2. Open `ltc-portal.html` in any browser
3. 無需登入、無需資料庫、無需後端

No authentication, no database, no backend required.

## 內容 / Contents

- **ltc-portal.html** — 完整互動原型 / Full interactive prototype
  - 角色：系統管理員、中心主任、經理、老闆，加一般員工自助頁
  - Roles: System Admin, Center Director, Manager, Owner, plus the employee self-service page
  - 一般員工使用「私人秘書」自助頁（仿 104）：出勤月曆、打卡／補卡、請假、加班（半小時為單位）、表單申請與追蹤、薪資袋、保險費、所得稅、課程
  - Employees get a 104-style self-service "My Desk": attendance calendar, clock in/out and corrections, leave, overtime (30-minute units), forms and tracking, payslips, insurance, tax, courses
  - 公告、人事、文件管理、服務管理、財務與採購、薪資計算、報表匯出（CSV）、系統設定、權限模組
  - Announcements, HR, Document Control, Service Management, Finance & Procurement, Payroll, Reports Export (CSV), Settings, Permissions
  - **v2.2（9/30 會議）**：僱用狀態（在職／留職停薪／離職）與篩選、年資起算日（跨據點／跨公司轉調不重置、留停計入、回任重新起算）、計薪方式（月薪／時薪／拆帳，拆帳暫不自動計算）、緊急聯絡人 2 位（1 必填 1 選填）、現金領薪選項、所有報表同時輸出員編與姓名、員編規則（發號公司字母 + 5 碼流水號）、9/30 待確認事項
  - **v2.2 (30 Sept meeting)**: employment status (Active / Unpaid leave / Left) with filter, seniority start date (kept on transfer, restarted on rehire), pay basis (monthly / hourly / revenue share — revenue share is excluded from auto-calculation for now), two emergency contacts (1 required, 1 optional), cash-pay option, employee number + name in every report, an employee-number rule (issuing-company letter + 5-digit serial), and the open items from the meeting
  - 三個待決議題（可透過 ASSUMPTION 開關比較）
  - Three open questions with live toggle to compare scenarios

- **docs/ltc-portal-walkthrough.md** — 15 分鐘導覽指南
  - 如何進行 9/30 會議示範
  - Meeting walkthrough guide (15 min)

## 決策架構 / Decision Framework

| 問題 | 預設 | 影響 |
|-----|------|------|
| **Q1** 中心主任可跨據點查看？ | 否（單一中心） | 隱私 vs. 靈活排班 |
| **Q2** 管理員看薪資？ | 否（隱藏） | 流程控制 vs. 技術隔離 |
| **Q3** 請假需複核？ | 是（兩層） | 控管 vs. 速度 |

## 開發階段 / Roadmap

- **Phase 1** (Sept): 原型決策 / Prototype & decisions
- **Phase 2** (Nov–Dec): 薪資、報表、擴展到台中 / Payroll, reports, expand to Taichung
- **Phase 3** (2027 Q1): 個案管理、擴展到彰化 / Case management, expand to Changhua

## 當前範圍 / Current Scope

- **設施**: 新竹竹北日照中心、竹東日照中心、新竹營運中心（共 3 個據點）
- **Facilities**: Zhubei and Zhudong day care centers plus the Hsinchu operations center (3 sites)
- **員工**: 23 位示範員工 (demo staff)
- **角色**: 系統管理員、中心主任、經理、老闆 + 一般員工 (4 + employee)
- **沒有**: 登入、資料庫、真實資料、持久化
- **No**: authentication, database, real data, persistence

## 測試 / Tests

```
npm ci
npm run test:unit   # jest
npm run test:e2e    # playwright (set PW_CHROMIUM_PATH if Chromium is not the expected build)
```

---

Made with User + AI tools.  
v2.1 · Sept 2026
