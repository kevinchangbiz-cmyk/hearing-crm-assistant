import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getAuthorizedStore } from "@/lib/stores";
import { appendRecordToSheet } from "@/lib/google";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) {
    return NextResponse.json({ error: "未登入" }, { status: 401 });
  }

  let body: {
    storeId?: string;
    customerName?: string;
    rawText?: string;
    crmResult?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "請求格式錯誤" }, { status: 400 });
  }

  const { storeId, customerName, rawText, crmResult } = body;
  if (!storeId || !crmResult?.trim()) {
    return NextResponse.json({ error: "缺少店別或 CRM 內容" }, { status: 400 });
  }

  const store = getAuthorizedStore(email, storeId);
  if (!store) {
    return NextResponse.json({ error: "無此店別權限" }, { status: 403 });
  }
  if (!store.googleSheetId || store.googleSheetId.startsWith("請填入")) {
    return NextResponse.json(
      { error: `店別「${store.name}」尚未設定 Google Sheet ID` },
      { status: 400 },
    );
  }

  try {
    await appendRecordToSheet({
      spreadsheetId: store.googleSheetId,
      storeName: store.name,
      customerName: customerName?.trim() || "",
      rawText: rawText?.trim() || "",
      crmResult: crmResult.trim(),
      createdBy: email,
    });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("[api/sheet] error", err);
    return NextResponse.json(
      { error: err?.message || "寫入 Google Sheet 失敗" },
      { status: 500 },
    );
  }
}
