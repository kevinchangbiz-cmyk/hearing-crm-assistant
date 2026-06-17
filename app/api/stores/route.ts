import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getStoresForUser } from "@/lib/stores";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "未登入" }, { status: 401 });
  }

  const stores = getStoresForUser(session.user.email).map((s) => ({
    id: s.id,
    name: s.name,
  }));

  return NextResponse.json({ stores });
}
