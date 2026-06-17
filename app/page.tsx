"use client";

import { signIn, useSession } from "next-auth/react";
import CrmApp from "@/components/CrmApp";

export default function Home() {
  const { status } = useSession();

  if (status === "loading") {
    return (
      <div className="center">
        <p className="muted">載入中…</p>
      </div>
    );
  }

  if (status === "unauthenticated") {
    return (
      <div className="center">
        <h1 style={{ margin: 0 }}>助聽器服務紀錄助手</h1>
        <p className="muted" style={{ maxWidth: 320 }}>
          語音輸入 → AI 整理 CRM → 一鍵複製 → 備份 Google Sheet → 建立提醒。
        </p>
        <button
          className="btn btn-primary"
          onClick={() => signIn("google")}
        >
          使用 Google 登入
        </button>
      </div>
    );
  }

  return <CrmApp />;
}
