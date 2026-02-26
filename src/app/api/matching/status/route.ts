import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const user = await authenticateRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // 2つの独立クエリを並列実行（memberGroups で memberships も兼ねる）
    const [{ data: memberGroups }, { data: activeReq }] = await Promise.all([
      supabaseAdmin
        .from("match_group_members")
        .select("group_id, match_groups(id, status)")
        .eq("user_id", user.id),
      supabaseAdmin
        .from("match_requests")
        .select("*")
        .eq("user_id", user.id)
        .eq("status", "waiting")
        .order("created_at", { ascending: false })
        .limit(1)
        .single(),
    ]);

    // memberGroups から completed と active を同時に分類（1ループ）
    let hasPendingReview = false;
    const activeGroupIds: string[] = [];

    if (memberGroups) {
      const completedGroupIds: string[] = [];
      for (const mg of memberGroups) {
        const g = mg.match_groups as unknown as { id: string; status: string } | null;
        if (!g) continue;
        if (g.status === "completed") completedGroupIds.push(g.id);
        if (g.status === "pending" || g.status === "confirmed") activeGroupIds.push(g.id);
      }

      if (completedGroupIds.length > 0) {
        const reviewCounts = await Promise.all(
          completedGroupIds.map((id) =>
            supabaseAdmin
              .from("reviews")
              .select("*", { count: "exact", head: true })
              .eq("group_id", id)
              .eq("reviewer_id", user.id)
          )
        );
        hasPendingReview = reviewCounts.some((r) => r.count === 0);
      }
    }

    if (activeReq) {
      return NextResponse.json({ status: "waiting", request: activeReq, hasPendingReview });
    }

    if (activeGroupIds.length > 0) {
      // グループ + メンバー情報を1クエリで取得（直列ウォーターフォール排除）
      const { data: activeGroup } = await supabaseAdmin
        .from("match_groups")
        .select("*, match_group_members(user_id, users(id, nickname, birth_year, industry, avatar_emoji, bio))")
        .in("id", activeGroupIds)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (activeGroup) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { match_group_members, ...group } = activeGroup as any;
        const members = match_group_members?.map((m: { users: unknown }) => m.users);

        return NextResponse.json({
          status: "matched",
          group,
          members,
          hasPendingReview,
        });
      }
    }

    return NextResponse.json({ status: "idle", hasPendingReview });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
