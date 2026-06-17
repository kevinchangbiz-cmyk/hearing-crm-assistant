/** 純前端邏輯：依 CRM 內容與提醒文字推導提醒標題與預設日期（不含 node 相依） */

const CATEGORY_ORDER = ["聽檢", "調整", "維修", "保養", "總公司客服", "其他"] as const;

/** 判斷是否為新客（出現新客聽檢的子標題或關鍵字） */
export function isNewCustomer(crm: string): boolean {
  return (
    crm.includes("病史與行為觀察") ||
    crm.includes("試聽狀況") ||
    crm.includes("新客")
  );
}

/** 取得 CRM 中第一個出現的服務類型 */
export function primaryServiceType(crm: string): string {
  for (const cat of CATEGORY_ORDER) {
    if (crm.includes(`<${cat}>`)) return cat;
  }
  return "服務";
}

const SIX_CATEGORIES = ["保養", "調整", "維修", "聽檢", "總公司客服", "其他"] as const;

/**
 * 取「內容篇幅最多」的那個六大類作為主要類別。
 * 例如同時有 <保養> 與 <調整>，哪一段文字較長就用哪個。
 */
export function primaryCategoryByLength(crm: string): string {
  const found: { cat: string; idx: number }[] = [];
  for (const cat of SIX_CATEGORIES) {
    const idx = crm.indexOf(`<${cat}>`);
    if (idx >= 0) found.push({ cat, idx });
  }
  if (found.length === 0) return "服務";

  found.sort((a, b) => a.idx - b.idx);

  let bestCat = found[0].cat;
  let bestLen = -1;
  for (let i = 0; i < found.length; i++) {
    const start = found[i].idx + found[i].cat.length + 2; // +2 為 "<>" 兩個字元
    const end = i + 1 < found.length ? found[i + 1].idx : crm.length;
    const len = crm.slice(start, end).trim().length;
    if (len > bestLen) {
      bestLen = len;
      bestCat = found[i].cat;
    }
  }
  return bestCat;
}

/** 當天服務紀錄的日曆標題：姓名 + 主要類別（篇幅最多者）；新客無 <聽檢> 標題時歸為「聽檢」 */
export function buildDayLogTitle(customerName: string, crm: string): string {
  const name = customerName.trim() || "客戶";
  const cat = isNewCustomer(crm) ? "聽檢" : primaryCategoryByLength(crm);
  return `${name} ${cat}`;
}

/**
 * 提醒標題規則：
 *  - 新客：姓名 + 新客試聽
 *  - 一般客戶：姓名 + 服務類型
 */
export function buildReminderTitle(customerName: string, crm: string): string {
  const name = customerName.trim() || "客戶";
  if (isNewCustomer(crm)) return `${name} 新客試聽`;
  return `${name} ${primaryServiceType(crm)}`;
}

function toDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * 依提醒文字推算預設日期（使用者仍可在確認卡片手動調整）。
 *  - 「三個月」→ +3 個月
 *  - 「下週/下周」→ +7 天
 *  - 偵測到 YYYY-MM-DD 或 MM/DD → 使用該日期
 *  - 其他 → 預設 +7 天
 */
export function suggestReminderDate(reminderText: string): string {
  const today = new Date();
  const text = reminderText || "";

  const isoMatch = text.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (isoMatch) {
    const d = new Date(
      Number(isoMatch[1]),
      Number(isoMatch[2]) - 1,
      Number(isoMatch[3]),
    );
    if (!Number.isNaN(d.getTime())) return toDateString(d);
  }

  // 月/日（無年份），例如 6/19、6月19日。若日期已過則視為明年。
  const mdMatch = text.match(/(\d{1,2})\s*[\/月]\s*(\d{1,2})\s*日?/);
  if (mdMatch) {
    const mo = Number(mdMatch[1]);
    const day = Number(mdMatch[2]);
    if (mo >= 1 && mo <= 12 && day >= 1 && day <= 31) {
      const startOfToday = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate(),
      );
      let d = new Date(today.getFullYear(), mo - 1, day);
      if (d.getTime() < startOfToday.getTime()) {
        d = new Date(today.getFullYear() + 1, mo - 1, day);
      }
      return toDateString(d);
    }
  }

  const monthMatch = text.match(/([一二兩三四五六七八九十\d]+)\s*個月/);
  if (monthMatch) {
    const months = parseChineseNumber(monthMatch[1]);
    if (months > 0) {
      const d = new Date(today);
      d.setMonth(d.getMonth() + months);
      return toDateString(d);
    }
  }

  const weekMatch = text.match(/([一二兩三四五六七八九十\d]+)\s*週|([一二兩三四五六七八九十\d]+)\s*周/);
  if (weekMatch) {
    const weeks = parseChineseNumber(weekMatch[1] || weekMatch[2]);
    if (weeks > 0) {
      const d = new Date(today);
      d.setDate(d.getDate() + weeks * 7);
      return toDateString(d);
    }
  }

  if (/下週|下周|下星期|一週|一周/.test(text)) {
    const d = new Date(today);
    d.setDate(d.getDate() + 7);
    return toDateString(d);
  }

  const dayMatch = text.match(/([一二兩三四五六七八九十\d]+)\s*天/);
  if (dayMatch) {
    const days = parseChineseNumber(dayMatch[1]);
    if (days > 0) {
      const d = new Date(today);
      d.setDate(d.getDate() + days);
      return toDateString(d);
    }
  }

  const d = new Date(today);
  d.setDate(d.getDate() + 7);
  return toDateString(d);
}

/**
 * 從提醒文字推測時間（HH:MM）。
 * 支援 14:30、下午3點、上午9點半、晚上7點。抓不到則回傳預設 "10:00"。
 */
export function suggestReminderTime(reminderText: string): string {
  const text = reminderText || "";

  const hm = text.match(/(\d{1,2})\s*[:：]\s*(\d{2})/);
  if (hm) {
    const h = Math.min(23, Number(hm[1]));
    const m = Math.min(59, Number(hm[2]));
    return `${pad(h)}:${pad(m)}`;
  }

  const cn = text.match(/(上午|早上|下午|晚上|傍晚|中午)?\s*(\d{1,2})\s*點\s*(半|(\d{1,2})\s*分)?/);
  if (cn) {
    let h = Number(cn[2]);
    const period = cn[1];
    if ((period === "下午" || period === "晚上" || period === "傍晚") && h < 12) {
      h += 12;
    }
    if (period === "中午" && h < 12) h = 12;
    let m = 0;
    if (cn[3] === "半") m = 30;
    else if (cn[4]) m = Number(cn[4]);
    return `${pad(Math.min(23, h))}:${pad(Math.min(59, m))}`;
  }

  return "10:00";
}

const pad = (n: number) => String(n).padStart(2, "0");

function parseChineseNumber(s: string): number {
  if (!s) return 0;
  if (/^\d+$/.test(s)) return Number(s);
  const map: Record<string, number> = {
    一: 1, 二: 2, 兩: 2, 三: 3, 四: 4, 五: 5,
    六: 6, 七: 7, 八: 8, 九: 9, 十: 10,
  };
  if (s === "十") return 10;
  if (s.includes("十")) {
    const [a, b] = s.split("十");
    const tens = a ? (map[a] ?? 1) : 1;
    const ones = b ? (map[b] ?? 0) : 0;
    return tens * 10 + ones;
  }
  return map[s] ?? 0;
}
