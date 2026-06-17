import { google } from "googleapis";

const SHEET_HEADER = [
  "建立時間",
  "店別",
  "客戶姓名",
  "原始輸入內容",
  "CRM整理結果",
  "建立者",
];

/**
 * 以「服務帳號 (Service Account)」取得 Google API 授權。
 * 所有 Sheet 寫入與日曆建立都由這個系統帳號統一處理，
 * 因此使用者本身不需被分享 Sheet / 日曆，只要該資源分享給服務帳號即可。
 */
function normalizePrivateKey(raw: string): string {
  let key = raw.trim();
  // 去掉可能誤帶的外層引號（單/雙引號）
  if (
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'"))
  ) {
    key = key.slice(1, -1);
  }
  // 字面 \n / \r\n 還原成真正的換行
  key = key.replace(/\\r\\n/g, "\n").replace(/\\r/g, "\n").replace(/\\n/g, "\n");

  // 不論換行如何被破壞，一律由 BEGIN/END 之間的內容重建標準 PEM（每 64 字一行）
  const match = key.match(
    /-----BEGIN ([A-Z ]+)-----([\s\S]*?)-----END \1-----/,
  );
  if (match) {
    const label = match[1].trim();
    const body = match[2].replace(/[^A-Za-z0-9+/=]/g, ""); // 只留 base64 字元
    const wrapped = body.match(/.{1,64}/g)?.join("\n") ?? body;
    key = `-----BEGIN ${label}-----\n${wrapped}\n-----END ${label}-----\n`;
  }

  return key;
}

const SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/calendar.events",
];

function getServiceAccountAuth() {
  // 優先：整份金鑰 JSON 以 base64 存放（最防呆，無換行問題）
  const b64 = process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64;
  if (b64 && b64.trim()) {
    const json = JSON.parse(Buffer.from(b64.trim(), "base64").toString("utf-8"));
    return new google.auth.JWT({
      email: json.client_email,
      key: json.private_key, // JSON 解析後已是正確含換行的 PEM
      scopes: SCOPES,
    });
  }

  // 備用：分開的 email + private key 環境變數
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
  if (!email || !rawKey) {
    throw new Error(
      "尚未設定服務帳號（GOOGLE_SERVICE_ACCOUNT_JSON_BASE64，或 GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY）",
    );
  }

  return new google.auth.JWT({
    email: email.trim(),
    key: normalizePrivateKey(rawKey),
    scopes: SCOPES,
  });
}

/** 確保試算表第一列有標題；若 A1 為空則寫入標題列 */
async function ensureSheetHeader(spreadsheetId: string) {
  const sheets = google.sheets({ version: "v4", auth: getServiceAccountAuth() });
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: "A1:F1",
  });
  const hasHeader = (res.data.values?.[0]?.length ?? 0) > 0;
  if (!hasHeader) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: "A1:F1",
      valueInputOption: "RAW",
      requestBody: { values: [SHEET_HEADER] },
    });
  }
}

/**
 * 將一筆服務紀錄附加到該店的 Google Sheet。
 */
export async function appendRecordToSheet(params: {
  spreadsheetId: string;
  storeName: string;
  customerName: string;
  rawText: string;
  crmResult: string;
  createdBy: string;
}) {
  const { spreadsheetId, storeName, customerName, rawText, crmResult, createdBy } =
    params;

  await ensureSheetHeader(spreadsheetId);

  const sheets = google.sheets({ version: "v4", auth: getServiceAccountAuth() });
  const createdAt = new Date().toLocaleString("zh-TW", {
    timeZone: "Asia/Taipei",
    hour12: false,
  });

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: "A1",
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      values: [[createdAt, storeName, customerName, rawText, crmResult, createdBy]],
    },
  });
}

const TIME_ZONE = "Asia/Taipei";
const TIMED_EVENT_MINUTES = 30;

const pad = (n: number) => String(n).padStart(2, "0");

/** 以「掛鐘時間」計算事件起訖（搭配 timeZone 欄位，避免伺服器時區干擾） */
function timedRange(date: string, time: string) {
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const startMs = Date.UTC(y, mo - 1, d, h, mi);
  const endMs = startMs + TIMED_EVENT_MINUTES * 60_000;
  const fmt = (ms: number) => {
    const dt = new Date(ms);
    return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(
      dt.getUTCDate(),
    )}T${pad(dt.getUTCHours())}:${pad(dt.getUTCMinutes())}:00`;
  };
  return { start: fmt(startMs), end: fmt(endMs) };
}

/**
 * 在該店的 Google Calendar 建立事件。
 * - 未給 time：建立「整天」事件（用於未來追蹤提醒）
 * - 有給 time：建立「指定時間」事件（用於當天服務紀錄）
 * date 格式 YYYY-MM-DD；time 格式 HH:MM
 */
export async function createCalendarReminder(params: {
  calendarId: string;
  summary: string;
  date: string;
  time?: string;
  description?: string;
}) {
  const { calendarId, summary, date, time, description } = params;
  const calendar = google.calendar({
    version: "v3",
    auth: getServiceAccountAuth(),
  });

  const timed = time ? timedRange(date, time) : null;

  const res = await calendar.events.insert({
    calendarId,
    requestBody: {
      summary,
      description,
      start: timed
        ? { dateTime: timed.start, timeZone: TIME_ZONE }
        : { date },
      end: timed ? { dateTime: timed.end, timeZone: TIME_ZONE } : { date },
      reminders: {
        useDefault: false,
        overrides: [{ method: "popup", minutes: timed ? 0 : 9 * 60 }],
      },
    },
  });

  return { id: res.data.id, htmlLink: res.data.htmlLink };
}
