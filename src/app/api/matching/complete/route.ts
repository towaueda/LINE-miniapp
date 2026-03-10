import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const authPromise = authenticateRequest(request);
  const bodyPromise = request.json();

  const user = await authPromise;
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { groupId } = await bodyPromise;
    if (!groupId) {
      return NextResponse.json({ error: "groupId required" }, { status: 400 });
    }

    // メンバー全員を取得してメンバーシップ確認
    const { data: members } = await supabaseAdmin
      .from("match_group_members")
      .select("id, user_id, completed_at")
      .eq("group_id", groupId);

    if (!members || members.length === 0) {
      return NextResponse.json({ error: "Not a member" }, { status: 403 });
    }

    const myMember = members.find((m) => m.user_id === user.id);
    if (!myMember) {
      return NextResponse.json({ error: "Not a member" }, { status: 403 });
    }

    // このユーザーの完了を記録（未記録の場合のみ）
    if (!myMember.completed_at) {
      await supabaseAdmin
        .from("match_group_members")
        .update({ completed_at: new Date().toISOString() })
        .eq("id", myMember.id);
    }

    // 確認済み人数をカウント（自分の新規確認を含む）
    const confirmed = members.filter(
      (m) => m.completed_at || m.user_id === user.id
    ).length;
    const total = members.length;

    // 全員確認済みならグループをcompleted に
    if (confirmed === total) {
      await supabaseAdmin
        .from("match_groups")
        .update({ status: "completed" })
        .eq("id", groupId);
    }

    return NextResponse.json({ confirmed, total, allConfirmed: confirmed === total });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
