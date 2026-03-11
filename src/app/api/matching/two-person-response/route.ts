import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const user = await authenticateRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!user.is_approved) {
    return NextResponse.json({ error: "アカウントが未承認です" }, { status: 403 });
  }
  if (user.is_banned) {
    return NextResponse.json({ error: "アカウントが停止されています" }, { status: 403 });
  }

  try {
    const { action } = await request.json();

    if (action !== "accept" && action !== "decline") {
      return NextResponse.json({ error: "無効なアクションです" }, { status: 400 });
    }

    // Find user's current two_person_offered request
    const { data: matchReq } = await supabaseAdmin
      .from("match_requests")
      .select("*")
      .eq("user_id", user.id)
      .eq("status", "two_person_offered")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (!matchReq) {
      return NextResponse.json({ error: "2人マッチングオファーが見つかりません" }, { status: 404 });
    }

    if (action === "accept") {
      const { data: groupId, error: rpcError } = await supabaseAdmin.rpc(
        "confirm_two_person_match",
        { p_request_id: matchReq.id }
      );

      if (rpcError) {
        return NextResponse.json({ error: "サーバーエラーが発生しました" }, { status: 500 });
      }

      if (groupId) {
        const { data: groupWithMembers } = await supabaseAdmin
          .from("match_groups")
          .select("*, match_group_members(user_id, users(id, nickname, birth_year, industry, avatar_emoji, bio))")
          .eq("id", groupId)
          .single();

        if (groupWithMembers) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { match_group_members, ...group } = groupWithMembers as any;
          const members = match_group_members?.map((m: { users: unknown }) => m.users);
          return NextResponse.json({ status: "matched", group, members });
        }
      }

      return NextResponse.json({ status: "waiting_for_partner" });
    }

    // action === 'decline'
    const { error: rpcError } = await supabaseAdmin.rpc("decline_two_person_match", {
      p_request_id: matchReq.id,
    });

    if (rpcError) {
      return NextResponse.json({ error: "サーバーエラーが発生しました" }, { status: 500 });
    }

    return NextResponse.json({ status: "no_match" });
  } catch {
    return NextResponse.json({ error: "サーバーエラーが発生しました" }, { status: 500 });
  }
}
