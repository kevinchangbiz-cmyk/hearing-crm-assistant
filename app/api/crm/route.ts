import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { generateCrm } from "@/lib/gemini";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "未登入" }, { status: 401 });
  }

  let body: { rawText?: string; customerName?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "請求格式錯誤" }, { status: 400 });
  }

  const rawText = (body.rawText ?? "").trim();
  if (!rawText) {
    return NextResponse.json({ error: "請輸入內容" }, { status: 400 });
  }

  try {
    const result = await generateCrm({
      rawText,
      customerName: body.customerName,
    });
    return NextResponse.json(result);
  } catch (err: any) {
    console.error("[api/crm] error", err);
    return NextResponse.json(
      { error: err?.message || "CRM 整理失敗" },
      { status: 500 },
    );
  }
}
