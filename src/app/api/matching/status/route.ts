import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const user = await authenticateRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Check for pending reviews
    let hasPendingReview = false;
    const { data: memberGroups } = await supabaseAdmin
      .from("match_group_members")
      .select("group_id, match_groups(id, status)")
      .eq("user_id", user.id);

    if (memberGroups) {
      for (const mg of memberGroups) {
        const group = mg.match_groups as unknown as { id: string; status: string } | null;
        if (group && group.status === "completed") {
          const { count } = await supabaseAdmin
            .from("reviews")
            .select("*", { count: "exact", head: true })
            .eq("group_id", group.id)
            .eq("reviewer_id", user.id);

          if (count === 0) {
            hasPendingReview = true;
            break;
          }
        }
      }
    }

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
      return NextResponse.json({ status: "waiting", request: activeReq, hasPendingReview });
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
          .select("user_id, users(id, nickname, birth_year, industry, avatar_emoji, bio)")
          .eq("group_id", activeGroup.id);

        return NextResponse.json({
          status: "matched",
          group: activeGroup,
          members: members?.map((m) => m.users),
          hasPendingReview,
        });
      }
    }

    return NextResponse.json({ status: "idle", hasPendingReview });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
