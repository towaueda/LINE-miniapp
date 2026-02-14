import { NextResponse } from "next/server";
import { verifyAdmin } from "../auth/route";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function GET(request: Request) {
  if (!verifyAdmin(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get("page") || "1");
  const limit = parseInt(url.searchParams.get("limit") || "20");
  const offset = (page - 1) * limit;

  const { data, count, error } = await supabaseAdmin
    .from("notifications")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
  }

  return NextResponse.json({
    notifications: data || [],
    total: count || 0,
    page,
    limit,
  });
}

export async function POST(request: Request) {
  if (!verifyAdmin(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { title, body, targetUserId, isGlobal } = await request.json();

    if (!title || !body) {
      return NextResponse.json({ error: "title and body required" }, { status: 400 });
    }

    if (isGlobal) {
      const { error } = await supabaseAdmin.from("notifications").insert({
        title,
        body,
        is_global: true,
        target_user_id: null,
      });

      if (error) {
        return NextResponse.json({ error: "Failed to create" }, { status: 500 });
      }
    } else if (targetUserId) {
      const { error } = await supabaseAdmin.from("notifications").insert({
        title,
        body,
        is_global: false,
        target_user_id: targetUserId,
      });

      if (error) {
        return NextResponse.json({ error: "Failed to create" }, { status: 500 });
      }
    } else {
      return NextResponse.json({ error: "targetUserId or isGlobal required" }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
