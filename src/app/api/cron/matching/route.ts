import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const authHeader = request.headers.get("Authorization");
  const expectedToken = `Bearer ${process.env.CRON_SECRET}`;

  if (!authHeader || authHeader !== expectedToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [offerResult, expireResult] = await Promise.all([
      supabaseAdmin.rpc("offer_two_person_matches"),
      supabaseAdmin.rpc("expire_no_match_requests"),
    ]);

    const offered = offerResult.data ?? 0;
    const expired = expireResult.data ?? 0;

    return NextResponse.json({ ok: true, offered, expired });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
