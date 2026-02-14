import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/server";
import { tryMatch } from "@/lib/matching";

export async function POST(request: Request) {
  const user = await authenticateRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { area, dates } = await request.json();

    if (!area || !dates || !dates.length) {
      return NextResponse.json({ error: "area and dates required" }, { status: 400 });
    }

    // Cancel any existing waiting request
    await supabaseAdmin
      .from("match_requests")
      .update({ status: "cancelled" })
      .eq("user_id", user.id)
      .eq("status", "waiting");

    // Create new request
    const { data: matchReq, error } = await supabaseAdmin
      .from("match_requests")
      .insert({
        user_id: user.id,
        area,
        available_dates: dates,
        status: "waiting",
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: "Failed to create request" }, { status: 500 });
    }

    // Try to match immediately
    const groupId = await tryMatch(matchReq.id);

    if (groupId) {
      // Match found! Return the group
      const { data: group } = await supabaseAdmin
        .from("match_groups")
        .select("*")
        .eq("id", groupId)
        .single();

      const { data: members } = await supabaseAdmin
        .from("match_group_members")
        .select("user_id, users(id, nickname, age_group, job, avatar_emoji, bio)")
        .eq("group_id", groupId);

      return NextResponse.json({
        status: "matched",
        group,
        members: members?.map((m) => m.users),
      });
    }

    return NextResponse.json({
      status: "waiting",
      request: matchReq,
    });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
