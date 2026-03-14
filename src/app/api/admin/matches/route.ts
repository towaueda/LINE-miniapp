import { NextResponse } from "next/server";
import { verifyAdmin } from "../auth/route";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function GET(request: Request) {
  if (!(await verifyAdmin(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "20", 10)));
  const status = url.searchParams.get("status") || "";
  const offset = (page - 1) * limit;

  let query = supabaseAdmin
    .from("match_groups")
    .select("*", { count: "exact" });

  if (status) {
    query = query.eq("status", status);
  }

  const { data, count, error } = await query
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    return NextResponse.json({ error: "Failed to fetch matches" }, { status: 500 });
  }

  // Get member info for each group
  const groupIds = (data || []).map((g) => g.id);
  const { data: members } = await supabaseAdmin
    .from("match_group_members")
    .select("group_id, users(id, nickname, avatar_emoji)")
    .in("group_id", groupIds.length > 0 ? groupIds : ["none"]);

  const memberMap: Record<string, unknown[]> = {};
  (members || []).forEach((m) => {
    if (!memberMap[m.group_id]) memberMap[m.group_id] = [];
    memberMap[m.group_id].push(m.users);
  });

  const enriched = (data || []).map((g) => ({
    ...g,
    members: memberMap[g.id] || [],
  }));

  return NextResponse.json({
    matches: enriched,
    total: count || 0,
    page,
    limit,
  });
}
