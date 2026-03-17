import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { adminDb } from "@/lib/firebase/admin";
import { tryMatch, expireOldMatchRequests, getGroupWithMembers } from "@/lib/matching";
import { isValidArea, validateDates } from "@/lib/validation";

export async function POST(request: Request) {
  const authPromise = authenticateRequest(request);
  const bodyPromise = request.json();

  const user = await authPromise;
  if (!user) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

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

    if (!isValidArea(area)) {
      return NextResponse.json({ error: "無効なエリアです" }, { status: 400 });
    }

    const dateResult = validateDates(dates);
    if (!dateResult.valid) {
      return NextResponse.json({ error: dateResult.reason }, { status: 400 });
    }

    // 期限切れリクエストを失効 + 完了済みグループのレビュー確認（並列）
    const [, membersSnap] = await Promise.all([
      expireOldMatchRequests(),
      adminDb.collection("match_group_members").where("user_id", "==", user.id).get(),
    ]);

    // 完了済みグループのレビュー未提出チェック
    const groupIds = membersSnap.docs.map((d) => d.data().group_id as string);
    if (groupIds.length > 0) {
      const groupDocs = await Promise.all(
        groupIds.map((id) => adminDb.collection("match_groups").doc(id).get())
      );
      const completedGroupIds = groupDocs
        .filter((d) => d.exists && d.data()!.status === "completed")
        .map((d) => d.id);

      if (completedGroupIds.length > 0) {
        const reviewCounts = await Promise.all(
          completedGroupIds.map((gId) =>
            adminDb
              .collection("reviews")
              .where("group_id", "==", gId)
              .where("reviewer_id", "==", user.id)
              .limit(1)
              .get()
          )
        );
        if (reviewCounts.some((snap) => snap.empty)) {
          return NextResponse.json({
            error: "レビュー未完了のマッチングがあります",
            hasPendingReview: true,
          }, { status: 400 });
        }
      }
    }

    // 既存の waiting リクエストをキャンセル
    const existingSnap = await adminDb
      .collection("match_requests")
      .where("user_id", "==", user.id)
      .where("status", "==", "waiting")
      .get();

    if (!existingSnap.empty) {
      const batch = adminDb.batch();
      existingSnap.docs.forEach((doc) => {
        batch.update(doc.ref, { status: "cancelled", updated_at: new Date().toISOString() });
      });
      batch.commit().catch(console.error);
    }

    // 新規リクエスト作成
    const now = new Date().toISOString();
    const matchReqRef = await adminDb.collection("match_requests").add({
      user_id: user.id,
      area,
      available_dates: dateResult.dates,
      status: "waiting",
      matched_group_id: null,
      created_at: now,
      updated_at: now,
    });

    // 即時マッチング試行
    const groupId = await tryMatch(matchReqRef.id);

    if (groupId) {
      const result = await getGroupWithMembers(groupId);
      if (result) {
        return NextResponse.json({ status: "matched", group: result.group, members: result.members });
      }
    }

    const matchReqDoc = await matchReqRef.get();
    return NextResponse.json({
      status: "waiting",
      request: { id: matchReqDoc.id, ...matchReqDoc.data() },
    });
  } catch {
    return NextResponse.json({ error: "サーバーエラーが発生しました" }, { status: 500 });
  }
}
