export type Store = {
  /** 店別代碼，例如 "yuanlin" */
  id: string;
  /** 店別顯示名稱，例如 "員林店" */
  name: string;
  /** 該店備份用的 Google Sheet ID */
  googleSheetId: string;
  /** 該店提醒用的 Google Calendar ID（個人主行事曆用 "primary"） */
  googleCalendarId: string;
};

export type Permission = {
  /** 使用者 Google email */
  email: string;
  /** 此使用者可存取的店別代碼清單 */
  storeIds: string[];
};

export type StoresConfig = {
  stores: Store[];
  permissions: Permission[];
};

/** CRM 整理結果 */
export type CrmResult = {
  /** 整理後的 CRM 內容（已去除 REMINDER 行） */
  crm: string;
  /** 偵測到的提醒內容，無則為 null */
  reminder: string | null;
};
