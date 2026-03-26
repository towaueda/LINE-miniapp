import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { authenticateRequest } from "@/lib/auth";
import { adminDb } from "@/lib/firebase/admin";
import { validateReviewScore, validateReviewComment } from "@/lib/validation";

export async function POST(request: Request) {
  const authPromise = authenticateRequest(request);
  const bodyPromise = request.json();

  const user = await authPromise;
  if (!user) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  try {
    const { groupId, reviews } = await bodyPromise;

    if (!groupId || typeof groupId !== "string") {
      return NextResponse.json({ error: "無効なgroupIdです" }, { status: 400 });
    }
    if (!reviews || !Array.isArray(reviews) || reviews.length === 0) {
      return NextResponse.json({ error: "レビューを1件以上入力してください" }, { status: 400 });
    }

    for (const r of reviews) {
      if (!r.targetId || typeof r.targetId !== "string") {
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
    const [membershipSnap, existingSnap] = await Promise.all([
      adminDb
        .collection("match_group_members")
        .where("group_id", "==", groupId)
        .where("user_id", "==", user.id)
        .limit(1)
        .get(),
      adminDb
        .collection("reviews")
        .where("group_id", "==", groupId)
        .where("reviewer_id", "==", user.id)
        .limit(1)
        .get(),
    ]);

    if (membershipSnap.empty) {
      return NextResponse.json({ error: "このグループのメンバーではありません" }, { status: 403 });
    }

    if (!existingSnap.empty) {
      return NextResponse.json({ error: "既にレビュー済みです" }, { status: 409 });
    }

    const now = new Date().toISOString();
    const batch = adminDb.batch();
    for (const r of reviews) {
      const reviewRef = adminDb.collection("reviews").doc();
      batch.set(reviewRef, {
        group_id: groupId,
        reviewer_id: user.id,
        target_id: r.targetId,
        communication: r.communication,
        punctuality: r.punctuality,
        meet_again: r.meetAgain,
        comment: r.comment || null,
        created_at: now,
      });
    }
    await batch.commit();

    // 招待コード生成（レスポンスをブロックしない）
    const code = `TRI-${randomBytes(3).toString("hex").toUpperCase()}`;
    adminDb.collection("invite_codes").add({
      code,
      generated_by: user.id,
      group_id: groupId,
      used_by: null,
      used_at: null,
      is_active: true,
      created_at: now,
    }).catch(console.error);

    return NextResponse.json({ success: true, inviteCode: code });
  } catch {
    return NextResponse.json({ error: "サーバーエラーが発生しました" }, { status: 500 });
  }
}
