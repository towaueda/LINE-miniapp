import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/server";
import { tryMatch } from "@/lib/matching";
import { isValidArea, validateDates } from "@/lib/validation";

export async function POST(request: Request) {
  // auth と body parsing を並列開始
  const authPromise = authenticateRequest(request);
  const bodyPromise = request.json();

  const user = await authPromise;
  if (!user) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  // 承認・BAN・プロフィール完成チェック
  if (!user.is_approved) {
    return NextResponse.json({ error: "アカウントが未承認です" }, { status: 403 });
  }
  if (user.is_banned) {
    return NextResponse.json({ error: "アカウントが停止されています" }, { status: 403 });
  }
  if (!user.nickname || !user.area || !user.industry) {
    return NextResponse.json({ error: "プロフィールを完成させてください" }, { status: 400 });
  }

  try {
    const { area, dates } = await bodyPromise;

    // エリアのバリデーション
    if (!isValidArea(area)) {
      return NextResponse.json({ error: "無効なエリアです" }, { status: 400 });
    }

    // 日付のバリデーション
    const dateResult = validateDates(dates);
    if (!dateResult.valid) {
      return NextResponse.json({ error: dateResult.reason }, { status: 400 });
    }

    // 期限切れリクエストを自動失効 + 未完了レビューの確認（並列）
    const [, { data: memberGroups }] = await Promise.all([
      supabaseAdmin.rpc("expire_old_match_requests"),
      supabaseAdmin
        .from("match_group_members")
        .select("group_id, match_groups(id, status)")
        .eq("user_id", user.id),
    ]);

    if (memberGroups) {
      const completedGroups = memberGroups
        .map((mg) => mg.match_groups as unknown as { id: string; status: string } | null)
        .filter((g): g is { id: string; status: string } => g !== null && g.status === "completed");

      if (completedGroups.length > 0) {
        const reviewCounts = await Promise.all(
          completedGroups.map((g) =>
            supabaseAdmin
              .from("reviews")
              .select("*", { count: "exact", head: true })
              .eq("group_id", g.id)
              .eq("reviewer_id", user.id)
          )
        );

        if (reviewCounts.some((r) => r.count === 0)) {
          return NextResponse.json({
            error: "レビュー未完了のマッチングがあります",
            hasPendingReview: true,
          }, { status: 400 });
        }
      }
    }

    // 既存の待機中リクエストをキャンセル（レスポンスをブロックしない）
    supabaseAdmin
      .from("match_requests")
      .update({ status: "cancelled" })
      .eq("user_id", user.id)
      .eq("status", "waiting")
      .then(() => {}, console.error);

    // 新規リクエスト作成
    const { data: matchReq, error } = await supabaseAdmin
      .from("match_requests")
      .insert({
        user_id: user.id,
        area,
        available_dates: dateResult.dates,
        status: "waiting",
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: "リクエストの作成に失敗しました" }, { status: 500 });
    }

    // 即時マッチング試行（アトミックRPC）
    const groupId = await tryMatch(matchReq.id);

    if (groupId) {
      // グループ + メンバー情報を1クエリで取得（2 DB round trips → 1）
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

    return NextResponse.json({
      status: "waiting",
      request: matchReq,
    });
  } catch {
    return NextResponse.json({ error: "サーバーエラーが発生しました" }, { status: 500 });
  }
}
