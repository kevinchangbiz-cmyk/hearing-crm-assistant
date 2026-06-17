# 規格文件索引 (docs/)

本資料夾整理自使用者提供的原始規格書，作為 Hearing CRM Assistant 的開發依據。

| 文件 | 內容 |
| --- | --- |
| [PROJECT_CONTEXT.md](./PROJECT_CONTEXT.md) | 專案背景、真正要解決的問題、不做什麼、設計原則 |
| [PRD.md](./PRD.md) | V1.0 完整產品需求 (Product Requirements) |
| [開發規格書_v1.0.md](./開發規格書_v1.0.md) | 最終開發規格書 (資料模型、介面、流程) |
| [CLAUDE_AI_INSTRUCTIONS.md](./CLAUDE_AI_INSTRUCTIONS.md) | 給開發 AI 的開發守則與禁止事項 |
| [六大類定義.md](./六大類定義.md) | CRM 六大分類定義 |
| [格式.md](./格式.md) | CRM 內容格式 (含新客聽檢特殊格式) |
| [實際範例.md](./實際範例.md) | 驗配師實際口述/紀錄範例 |

> Gemini 的 System Prompt 另存於專案根目錄的 [`prompts/`](../prompts/)。

## 經修正後的最終技術決策 (2026-06)

依使用者最新指示，相對原始規格書做了以下調整：

1. **完全移除 Supabase**。改以 Google OAuth 登入；店別/權限以專案內 `config/stores.json` 管理。
2. **Google Sheet 為唯一備份來源**。服務紀錄只寫入 Google Sheet，無額外資料庫。
3. **「最近 20 筆紀錄」降為非必要功能**，MVP 不實作。
4. **語音採即時轉錄優先 (Web Speech API)**，不採音檔上傳模式。
5. **Calendar 提醒必須先顯示確認**，使用者確認後才建立事件。

### 最終技術架構

- 框架：Next.js (App Router)，前端 + API Routes
- 登入：Auth.js (NextAuth) + Google OAuth (僅辨識身分)
- 寫入授權：Service Account 服務帳號 (統一寫入 Sheet / 日曆，使用者免分享)
- AI：Gemini 2.5 Flash
- 唯一儲存：Google Sheets API (每店一份)
- 設定/權限：`config/stores.json` + 環境變數 (無資料庫)
- 語音：Web Speech API 即時轉錄
- 日曆：Google Calendar API (每店專屬日曆)
  - 當天服務紀錄：按「備份」時，於服務日期/時間登記一筆「姓名＋主要類別」的指定時間事件
  - 追蹤提醒：偵測到追蹤事項時，另以「整天事件」建立未來提醒，須先確認
- 部署：Vercel

> 升級註：原為「以登入者本人 token 寫入」，後改為 Service Account 統一寫入，方便多人/多店擴充。
