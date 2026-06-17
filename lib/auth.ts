import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";

/**
 * 登入只用來「辨識使用者身分」，以決定他能看到哪些店別。
 * 實際寫入 Sheet / 建立日曆改由服務帳號 (Service Account) 處理，
 * 因此這裡不需要 Sheets / Calendar 權限，登入也更穩定。
 */
export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
      authorization: {
        params: {
          scope: "openid email profile",
          // 每次登入都顯示帳號選擇畫面（避免自動沿用上一個帳號）
          prompt: "select_account",
        },
      },
    }),
  ],
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 天
  },
};
