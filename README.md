# Hearing CRM Assistant

助聽器門市驗配師專用的服務紀錄助手。目標：**服務完成 → 語音輸入 → AI 整理 → 一鍵複製，30 秒內完成。**

> 這是一個「小工具」，不是 CRM / ERP / Agent 平台。開發守則見 [`docs/CLAUDE_AI_INSTRUCTIONS.md`](./docs/CLAUDE_AI_INSTRUCTIONS.md)。

## 功能 (MVP)

- Google 登入（OAuth）
- 多店別權限（每店綁定一份 Google Sheet 與一個 Google Calendar）
- 語音即時轉錄（Web Speech API，邊講邊出字，不上傳音檔）或直接打字
- Gemini 2.5 Flash 自動整理為六大分類 CRM（保養 / 調整 / 維修 / 聽檢 / 總公司客服 / 其他）
- 一鍵複製 CRM
- 備份至 Google Sheet（唯一儲存來源）
- 偵測追蹤提醒 →「先確認再建立」Google Calendar 事件

## 技術架構

| 項目 | 選型 |
| --- | --- |
| 框架 | Next.js 14（App Router）|
| 登入 | NextAuth + Google OAuth（僅辨識身分，決定可看哪些店）|
| AI | Gemini 2.5 Flash（`@google/generative-ai`）|
| 儲存 | Google Sheets API（每店一份）|
| 提醒 | Google Calendar API（每店一本專屬日曆）|
| 寫入授權 | **Service Account 服務帳號**（統一寫入 Sheet / 日曆，使用者免分享）|
| 店別/權限 | `config/stores.json` 或 `STORES_CONFIG` 環境變數（無資料庫）|
| 部署 | Vercel |

> **授權模型**：登入只用來辨識「你是誰、能看哪些店」；實際寫入 Google Sheet 與建立日曆事件，一律由服務帳號代勞。因此新增使用者時，只要把 email 加進 OAuth 測試使用者與 `stores.json` 權限即可，**不需要把 Sheet / 日曆逐一分享給每個人**——只要分享給服務帳號一次。

> 已依最新決策**完全移除 Supabase**，並以 Google Sheet 作為唯一備份來源。

## 目錄結構

```
hearing-crm-assistant/
├── app/                  # Next.js App Router
│   ├── api/              #   auth / stores / crm / sheet / calendar
│   ├── page.tsx          #   首頁（登入 + 主畫面）
│   ├── layout.tsx
│   └── globals.css
├── components/           # CrmApp、語音轉錄 hook
├── lib/                  # auth / gemini / google / prompt / stores / reminder
├── config/               # stores.json（店別與權限，已 gitignore）
├── docs/                 # 規格書（整理自原始 .docx/.txt）
└── prompts/              # Gemini System Prompt 來源
```

## 開始開發（本機）

### 1. 安裝相依套件

```bash
npm install
```

### 2. 設定環境變數

複製 `.env.example` 為 `.env.local`，填入下列值：

```bash
cp .env.example .env.local
```

- `NEXTAUTH_SECRET`：執行 `openssl rand -base64 32` 產生
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`：見下方 Google Cloud 設定
- `GEMINI_API_KEY`：到 <https://aistudio.google.com/app/apikey> 申請

### 3. 設定店別

編輯 `config/stores.json`（已預先放好範例），把每店的 `googleSheetId` 換成真實的 Google Sheet ID，並在 `permissions` 設定哪個 email 能存取哪些店。

- Google Sheet ID：試算表網址 `https://docs.google.com/spreadsheets/d/<這段就是ID>/edit`
- `googleCalendarId`：用個人主行事曆填 `primary`，或填特定行事曆 ID

### 4. 啟動

```bash
npm run dev
```

開啟 <http://localhost:3000>，用 Google 登入即可。

## Google Cloud 設定（OAuth + API）

1. 進入 [Google Cloud Console](https://console.cloud.google.com/) 建立專案。
2. **啟用 API**：Google Sheets API、Google Calendar API。
3. **OAuth 同意畫面**：使用者類型選「外部」，把要使用的驗配師 email 加入「測試使用者」（未發布前只有測試使用者能登入）。
4. **建立憑證 → OAuth 用戶端 ID → 網頁應用程式**：
   - 已授權的 JavaScript 來源：`http://localhost:3000`（部署後加上正式網址）
   - 已授權的重新導向 URI：
     - `http://localhost:3000/api/auth/callback/google`
     - 部署後：`https://<你的網域>/api/auth/callback/google`
5. 取得 Client ID / Client Secret 填入環境變數。

> 登入只要求 `openid email profile`，不需要 Sheets / Calendar 權限（那些由服務帳號處理）。

## Service Account 設定（統一寫入 Sheet / 日曆）

1. Google Cloud Console →「IAM 與管理」→「服務帳號」→「建立服務帳號」。
2. 命名（例如 `hearing-crm-writer`）→ 建立完成（角色可不指定）。
3. 進入該服務帳號 →「金鑰」→「新增金鑰」→「建立新的金鑰」→ JSON → 下載。
4. 打開 JSON，取出 `client_email` 與 `private_key`，填入環境變數：
   - `GOOGLE_SERVICE_ACCOUNT_EMAIL` = `client_email`
   - `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` = `private_key`（整段用雙引號包住，保留 `\n`）
5. **把資源分享給服務帳號**（這是唯一需要手動分享的一次）：
   - 每店的 **Google Sheet** → 分享給服務帳號 email，權限「編輯者」。
   - 每店的 **Google Calendar** → 該日曆設定 →「與特定使用者共用」→ 加入服務帳號 email，權限「變更活動」。
   - ⚠️ 服務帳號無法寫入個人的 `primary` 日曆，每店請使用各自建立的專屬日曆 ID。

## 部署到 Vercel

1. 將專案推到 GitHub，於 Vercel 匯入。
2. 設定環境變數（Project Settings → Environment Variables）：
   - `NEXTAUTH_URL` = 正式網址（例如 `https://hearing-crm.vercel.app`）
   - `NEXTAUTH_SECRET`、`GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET`、`GEMINI_API_KEY`
   - `GOOGLE_SERVICE_ACCOUNT_EMAIL`、`GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`（private_key 貼上時保留 `\n`）
   - `STORES_CONFIG` = 把 `config/stores.json` 整份內容壓成一行貼上（因為該檔不進版控）
3. 在 Google Cloud 的 OAuth 用戶端補上正式網址的來源與 callback。
4. Deploy。

## 注意事項

- 語音轉錄使用瀏覽器的 Web Speech API，建議使用 **Chrome**（桌機與 Android 皆可），需允許麥克風權限。
- 「最近 20 筆紀錄」依最新決策列為非必要，MVP 未實作；資料皆可從各店 Google Sheet 查閱。
- 本工具刻意維持簡單，請勿擴充 ERP、庫存、報表、客流、多 Agent 等功能。
