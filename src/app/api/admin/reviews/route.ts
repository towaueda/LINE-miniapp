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
  const minRating = url.searchParams.get("minRating");
  const maxRating = url.searchParams.get("maxRating");

  let query = adminDb.collection("reviews") as FirebaseFirestore.Query;
  if (minRating || maxRating) {
    // rating フィルタがある場合は communication でソート（Firestore の制約）
    if (minRating) query = query.where("communication", ">=", parseInt(minRating));
    if (maxRating) query = query.where("communication", "<=", parseInt(maxRating));
    query = query.orderBy("communication", "desc");
  } else {
    query = query.orderBy("created_at", "desc");
  }

  const snap = await query.get();
  const total = snap.size;
  const offset = (page - 1) * limit;
  const pageDocs = snap.docs.slice(offset, offset + limit);

  // レビュアー・対象者のニックネームを取得
  const userIdsSet = new Set(pageDocs.flatMap((d) => {
    const data = d.data();
    return [data.reviewer_id, data.target_id].filter(Boolean) as string[];
  }));
  const userIds = Array.from(userIdsSet);

  const userDocs = await Promise.all(
    userIds.map((uid) => adminDb.collection("users").doc(uid).get())
  );
  const userMap: Record<string, { nickname: string; avatar_emoji: string }> = {};
  userDocs.forEach((d) => {
    if (d.exists) {
      userMap[d.id] = {
        nickname: d.data()!.nickname || "",
        avatar_emoji: d.data()!.avatar_emoji || "",
      };
    }
  });

  const reviews = pageDocs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      ...data,
      reviewer: userMap[data.reviewer_id] || null,
      target: userMap[data.target_id] || null,
    };
  });

  return NextResponse.json({ reviews, total, page, limit });
}
