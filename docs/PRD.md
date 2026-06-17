# Hearing CRM Assistant V1.0 完整開發規格書 (PRD)

## 專案定位
助聽器驗配師專用服務紀錄助手。目標是將服務紀錄行政時間降到最低，不做 CRM、不做 ERP、不做 Agent 平台。

## 核心目標
語音/文字輸入 → AI 整理 CRM → 一鍵複製 → 備份至 Google Sheet → 必要時建立 Calendar 提醒。

## 使用者角色
驗配師、店長、區域主管。

## 系統架構 (原始規格)
Google OAuth、Next.js、Supabase、Gemini 2.5 Flash、Google Sheets API、Google Calendar API。

> 註：依最新決策已移除 Supabase，詳見 [README.md](./README.md)。

## 登入流程
Google 登入 → 首次設定 → 建立店別對應 Calendar 與 Sheet → 完成。

## 店別管理
每個使用者可擁有多店權限；每個店別綁定 1 個 Google Sheet 與 1 個 Google Calendar。

## 首頁 Wireframe
店別下拉選單、客戶姓名、語音按鈕、文字輸入區、CRM 結果區、最近 20 筆紀錄。

## 語音流程
錄音 → 即時轉文字 → 送 Gemini → 回傳 CRM 格式。

## CRM 分類
保養、調整、維修、聽檢、總公司客服、其他。

## CRM 規則
AI 自動分類；無內容不顯示；調整需包含主訴 / 處理方式 / 結果。

## Google Sheet 結構
欄位：建立時間、店別、客戶姓名、原始輸入內容、CRM 整理結果、建立者。

## Calendar 規則
偵測：三個月後追蹤、下週回診、指定日期回診、聯絡提醒。
標題規則：
- 一般客戶：姓名 + 服務類型
- 新客：姓名 + 新客試聽

## 權限設計
使用者只看得到被授權的店別。

## 手機版需求
RWD；手機可直接錄音產生 CRM。

## 桌機版需求
Chrome；支援內建或外接麥克風。

## Gemini Prompt 原則
1. 自動判斷六大分類
2. 使用助聽器門市專業語氣
3. 避免流水帳
4. 保留重要技術調整內容
5. 追蹤事項放入 `<其他>`

## V1 不做
LINE、客流量統計、銷售統計、庫存、ERP、CRM 自動操作、Agent。

## 開發順序
- Phase 1：登入、店別、語音、CRM
- Phase 2：Google Sheet 備份
- Phase 3：Calendar 提醒
- Phase 4：優化 Prompt

## 驗收標準
- 30 秒內完成一筆紀錄
- AI 分類正確率高
- 可正常寫入 Sheet
- 可正常建立 Calendar
