import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getAuthorizedStore } from "@/lib/stores";
import { createCalendarReminder } from "@/lib/google";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) {
    return NextResponse.json({ error: "未登入" }, { status: 401 });
  }

  let body: {
    storeId?: string;
    summary?: string;
    date?: string;
    time?: string;
    description?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "請求格式錯誤" }, { status: 400 });
  }

  const { storeId, summary, date, time, description } = body;
  if (!storeId || !summary?.trim() || !date) {
    return NextResponse.json(
      { error: "缺少店別、提醒標題或日期" },
      { status: 400 },
    );
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "日期格式需為 YYYY-MM-DD" }, { status: 400 });
  }
  if (time && !/^\d{2}:\d{2}$/.test(time)) {
    return NextResponse.json({ error: "時間格式需為 HH:MM" }, { status: 400 });
  }

  const store = getAuthorizedStore(email, storeId);
  if (!store) {
    return NextResponse.json({ error: "無此店別權限" }, { status: 403 });
  }

  if (!store.googleCalendarId || store.googleCalendarId === "primary") {
    return NextResponse.json(
      { error: `店別「${store.name}」需設定專屬日曆 ID（服務帳號無法寫入個人 primary 日曆）` },
      { status: 400 },
    );
  }

  try {
    const event = await createCalendarReminder({
      calendarId: store.googleCalendarId,
      summary: summary.trim(),
      date,
      time,
      description,
    });
    return NextResponse.json({ ok: true, event });
  } catch (err: any) {
    console.error("[api/calendar] error", err);
    return NextResponse.json(
      { error: err?.message || "建立 Calendar 事件失敗" },
      { status: 500 },
    );
  }
}
