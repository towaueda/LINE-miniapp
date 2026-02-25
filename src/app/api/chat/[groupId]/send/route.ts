import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/server";
import { validateMessageText } from "@/lib/validation";

export async function POST(
  request: Request,
  { params }: { params: { groupId: string } }
) {
  // auth と body parsing を並列開始
  const authPromise = authenticateRequest(request);
  const bodyPromise = request.json();

  const user = await authPromise;
  if (!user) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const { groupId } = params;

  // メンバーシップ確認 + グループステータス確認（並列）
  const [{ data: membership }, { data: group }] = await Promise.all([
    supabaseAdmin
      .from("match_group_members")
      .select("id")
      .eq("group_id", groupId)
      .eq("user_id", user.id)
      .single(),
    supabaseAdmin
      .from("match_groups")
      .select("status, date")
      .eq("id", groupId)
      .single(),
  ]);

  if (!membership) {
    return NextResponse.json({ error: "このグループのメンバーではありません" }, { status: 403 });
  }

  if (!group) {
    return NextResponse.json({ error: "グループが見つかりません" }, { status: 404 });
  }

  if (group.status === "completed" || group.status === "cancelled") {
    return NextResponse.json({ error: "このグループのチャットは終了しています" }, { status: 403 });
  }

  // マッチ日の23:59（JST）でチャット期限切れ
  const matchDate = new Date(group.date + "T23:59:59+09:00");
  if (Date.now() > matchDate.getTime()) {
    return NextResponse.json({ error: "チャット期限が過ぎています" }, { status: 403 });
  }

  try {
    const { text } = await bodyPromise;

    const textError = validateMessageText(text);
    if (textError) {
      return NextResponse.json({ error: textError }, { status: 400 });
    }

    const { data: message, error } = await supabaseAdmin
      .from("messages")
      .insert({
        group_id: groupId,
        sender_id: user.id,
        sender_name: user.nickname || "???",
        text: text.trim(),
        is_system: false,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: "メッセージの送信に失敗しました" }, { status: 500 });
    }

    return NextResponse.json({ message });
  } catch {
    return NextResponse.json({ error: "サーバーエラーが発生しました" }, { status: 500 });
  }
}
