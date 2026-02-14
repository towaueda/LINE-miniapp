import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const user = await authenticateRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Check for active match request
    const { data: activeReq } = await supabaseAdmin
      .from("match_requests")
      .select("*")
      .eq("user_id", user.id)
      .eq("status", "waiting")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (activeReq) {
      return NextResponse.json({ status: "waiting", request: activeReq });
    }

    // Check for active match group
    const { data: memberships } = await supabaseAdmin
      .from("match_group_members")
      .select("group_id")
      .eq("user_id", user.id);

    if (memberships && memberships.length > 0) {
      const groupIds = memberships.map((m) => m.group_id);

      const { data: activeGroup } = await supabaseAdmin
        .from("match_groups")
        .select("*")
        .in("id", groupIds)
        .in("status", ["pending", "confirmed"])
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (activeGroup) {
        const { data: members } = await supabaseAdmin
          .from("match_group_members")
          .select("user_id, users(id, nickname, age_group, job, avatar_emoji, bio)")
          .eq("group_id", activeGroup.id);

        return NextResponse.json({
          status: "matched",
          group: activeGroup,
          members: members?.map((m) => m.users),
        });
      }
    }

    return NextResponse.json({ status: "idle" });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
