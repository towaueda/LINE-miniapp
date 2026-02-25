import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/server";
import { isValidUUID, validateReviewScore, validateReviewComment } from "@/lib/validation";

export async function POST(request: Request) {
  // auth と body parsing を並列開始
  const authPromise = authenticateRequest(request);
  const bodyPromise = request.json();

  const user = await authPromise;
  if (!user) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  try {
    const { groupId, reviews } = await bodyPromise;

    if (!isValidUUID(groupId)) {
      return NextResponse.json({ error: "無効なgroupIdです" }, { status: 400 });
    }
    if (!reviews || !Array.isArray(reviews) || reviews.length === 0) {
      return NextResponse.json({ error: "レビューを1件以上入力してください" }, { status: 400 });
    }

    // 各レビューのバリデーション
    for (const r of reviews) {
      if (!isValidUUID(r.targetId)) {
        return NextResponse.json({ error: "無効なtargetIdです" }, { status: 400 });
      }
      const errors = [
        validateReviewScore(r.communication, "communication"),
        validateReviewScore(r.punctuality, "punctuality"),
        validateReviewScore(r.meetAgain, "meetAgain"),
        validateReviewComment(r.comment),
      ].filter(Boolean);

      if (errors.length > 0) {
        return NextResponse.json({ error: errors.join(", ") }, { status: 400 });
      }
    }

    // メンバーシップ確認 + レビュー済みチェック（並列）
    const [{ data: membership }, { data: existing }] = await Promise.all([
      supabaseAdmin
        .from("match_group_members")
        .select("id")
        .eq("group_id", groupId)
        .eq("user_id", user.id)
        .single(),
      supabaseAdmin
        .from("reviews")
        .select("id")
        .eq("group_id", groupId)
        .eq("reviewer_id", user.id)
        .limit(1),
    ]);

    if (!membership) {
      return NextResponse.json({ error: "このグループのメンバーではありません" }, { status: 403 });
    }

    if (existing && existing.length > 0) {
      return NextResponse.json({ error: "既にレビュー済みです" }, { status: 409 });
    }

    // レビューを保存
    const reviewInserts = reviews.map((r: {
      targetId: string;
      communication: number;
      punctuality: number;
      meetAgain: number;
      comment?: string;
    }) => ({
      group_id: groupId,
      reviewer_id: user.id,
      target_id: r.targetId,
      communication: r.communication,
      punctuality: r.punctuality,
      meet_again: r.meetAgain,
      comment: r.comment || null,
    }));

    const { error: reviewError } = await supabaseAdmin
      .from("reviews")
      .insert(reviewInserts);

    if (reviewError) {
      console.error("レビュー保存エラー:", reviewError);
      return NextResponse.json({ error: "レビューの保存に失敗しました" }, { status: 500 });
    }

    // 招待コードを生成（DBインサートはレスポンスをブロックしない）
    const code = `TRI-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    supabaseAdmin.from("invite_codes").insert({
      code,
      generated_by: user.id,
      group_id: groupId,
      is_active: true,
    }).then(() => {}, console.error);

    return NextResponse.json({ success: true, inviteCode: code });
  } catch {
    return NextResponse.json({ error: "サーバーエラーが発生しました" }, { status: 500 });
  }
}
