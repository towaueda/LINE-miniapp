import { NextResponse } from "next/server";
import { verifyAdmin } from "../auth/route";
import { adminDb } from "@/lib/firebase/admin";

export async function GET(request: Request) {
  if (!(await verifyAdmin(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "20", 10)));
  const status = url.searchParams.get("status") || "";

  let query = adminDb.collection("match_groups").orderBy("created_at", "desc") as FirebaseFirestore.Query;
  if (status) {
    query = query.where("status", "==", status);
  }

  // Firestore はページネーションに offset がないため、カーソルベースで対応
  // 総数取得のためにまず全件カウント
  const countSnap = await query.get();
  const total = countSnap.size;

  const offset = (page - 1) * limit;
  const pageDocs = countSnap.docs.slice(offset, offset + limit);

  // グループIDを抽出してメンバー情報を取得
  const groupIds = pageDocs.map((d) => d.id);
  const memberSnaps = await Promise.all(
    groupIds.map((id) =>
      adminDb.collection("match_group_members").where("group_id", "==", id).get()
    )
  );

  // ユーザー情報をバッチ取得
  const allUserIdsSet = new Set(memberSnaps.flatMap((s) => s.docs.map((d) => d.data().user_id as string)));
  const allUserIds = Array.from(allUserIdsSet);
  const userDocs = await Promise.all(
    allUserIds.map((uid) => adminDb.collection("users").doc(uid).get())
  );
  const userMap: Record<string, { id: string; nickname: string; avatar_emoji: string }> = {};
  userDocs.forEach((d) => {
    if (d.exists) {
      userMap[d.id] = {
        id: d.id,
        nickname: d.data()!.nickname,
        avatar_emoji: d.data()!.avatar_emoji,
      };
    }
  });

  const memberMap: Record<string, unknown[]> = {};
  memberSnaps.forEach((snap) => {
    snap.docs.forEach((d) => {
      const gId = d.data().group_id;
      if (!memberMap[gId]) memberMap[gId] = [];
      const uid = d.data().user_id;
      if (userMap[uid]) memberMap[gId].push(userMap[uid]);
    });
  });

  const enriched = pageDocs.map((d) => ({
    id: d.id,
    ...d.data(),
    members: memberMap[d.id] || [],
  }));

  return NextResponse.json({ matches: enriched, total, page, limit });
}
