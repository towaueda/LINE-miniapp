import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { verifyAdmin } from "../auth/route";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function GET(request: Request) {
  if (!(await verifyAdmin(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "20", 10)));
  const offset = (page - 1) * limit;

  const { data, count, error } = await supabaseAdmin
    .from("invite_codes")
    .select("*, generator:users!generated_by(nickname), consumer:users!used_by(nickname)", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
  }

  return NextResponse.json({
    invites: data || [],
    total: count || 0,
    page,
    limit,
  });
}

export async function POST(request: Request) {
  if (!(await verifyAdmin(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { count: batchCount } = await request.json();
    const num = Math.min(Math.max(parseInt(batchCount) || 1, 1), 100);

    const codes = Array.from({ length: num }, () => ({
      code: `TRI-${randomBytes(3).toString("hex").toUpperCase()}`,
      is_active: true,
    }));

    const { error } = await supabaseAdmin.from("invite_codes").insert(codes);

    if (error) {
      return NextResponse.json({ error: "Failed to generate" }, { status: 500 });
    }

    return NextResponse.json({ success: true, count: num, codes: codes.map((c) => c.code) });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
