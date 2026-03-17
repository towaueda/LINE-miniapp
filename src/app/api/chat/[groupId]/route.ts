import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { adminDb } from "@/lib/firebase/admin";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

export async function GET(
  request: Request,
  { params }: { params: { groupId: string } }
) {
  const user = await authenticateRequest(request);
  if (!user) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const { groupId } = params;

  const url = new URL(request.url);
  const limitParam = parseInt(url.searchParams.get("limit") || "", 10);
  const limit = Math.min(
    Number.isFinite(limitParam) && limitParam > 0 ? limitParam : DEFAULT_LIMIT,
    MAX_LIMIT
  );
  const before = url.searchParams.get("before");

  // メンバーシップ確認とメッセージ取得を並列実行
  const membershipPromise = adminDb
    .collection("match_group_members")
    .where("group_id", "==", groupId)
    .where("user_id", "==", user.id)
    .limit(1)
    .get();

  let msgQuery = adminDb
    .collection("messages")
    .where("group_id", "==", groupId)
    .orderBy("created_at", "desc")
    .limit(limit + 1);

  if (before) {
    msgQuery = msgQuery.where("created_at", "<", before) as typeof msgQuery;
  }

  const [membershipSnap, messagesSnap] = await Promise.all([membershipPromise, msgQuery.get()]);

  if (membershipSnap.empty) {
    return NextResponse.json({ error: "このグループのメンバーではありません" }, { status: 403 });
  }

  const allRows = messagesSnap.docs.map((d) => ({ id: d.id, ...d.data() } as { id: string; created_at: string; [key: string]: unknown }));
  const hasMore = allRows.length > limit;
  const pageRows = hasMore ? allRows.slice(0, limit) : allRows;

  // 表示用に昇順に並べ替え
  const messages = pageRows.reverse();

  return NextResponse.json({
    messages,
    hasMore,
    nextCursor: hasMore ? pageRows[pageRows.length - 1].created_at : null,
  });
}
