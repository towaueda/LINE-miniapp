import { NextResponse } from "next/server";
import { offerTwoPersonMatches, expireNoMatchRequests } from "@/lib/matching";

export async function GET(request: Request) {
  const authHeader = request.headers.get("Authorization");
  const expectedToken = `Bearer ${process.env.CRON_SECRET}`;

  if (!authHeader || authHeader !== expectedToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [offered, expired] = await Promise.all([
      offerTwoPersonMatches(),
      expireNoMatchRequests(),
    ]);

    return NextResponse.json({ ok: true, offered, expired });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
