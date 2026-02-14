import { NextResponse } from "next/server";
import { verifyAdmin } from "../auth/route";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function GET(request: Request) {
  if (!verifyAdmin(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const search = url.searchParams.get("search") || "";
  const page = parseInt(url.searchParams.get("page") || "1");
  const limit = parseInt(url.searchParams.get("limit") || "20");
  const filter = url.searchParams.get("filter") || "all";
  const offset = (page - 1) * limit;

  let query = supabaseAdmin
    .from("users")
    .select("*", { count: "exact" });

  if (search) {
    query = query.or(`nickname.ilike.%${search}%,line_user_id.ilike.%${search}%`);
  }

  if (filter === "banned") {
    query = query.eq("is_banned", true);
  } else if (filter === "active") {
    query = query.eq("is_banned", false);
  }

  const { data, count, error } = await query
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 });
  }

  return NextResponse.json({
    users: data || [],
    total: count || 0,
    page,
    limit,
  });
}
