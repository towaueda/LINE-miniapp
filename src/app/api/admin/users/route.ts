import { NextResponse } from "next/server";
import { verifyAdmin } from "../auth/route";
import { adminDb } from "@/lib/firebase/admin";

export async function GET(request: Request) {
  if (!(await verifyAdmin(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const search = url.searchParams.get("search") || "";
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "20", 10)));
  const filter = url.searchParams.get("filter") || "all";

  let query = adminDb.collection("users").orderBy("created_at", "desc") as FirebaseFirestore.Query;

  if (filter === "banned") {
    query = query.where("is_banned", "==", true);
  } else if (filter === "active") {
    query = query.where("is_banned", "==", false);
  }

  const snap = await query.get();
  let docs = snap.docs;

  // 検索はクライアントサイドでフィルタ（Firestoreはfull-text searchが非対応）
  if (search) {
    const lower = search.toLowerCase();
    docs = docs.filter((d) => {
      const data = d.data();
      return (
        (data.nickname && data.nickname.toLowerCase().includes(lower)) ||
        (data.line_user_id && data.line_user_id.toLowerCase().includes(lower))
      );
    });
  }

  const total = docs.length;
  const offset = (page - 1) * limit;
  const pageDocs = docs.slice(offset, offset + limit);

  const users = pageDocs.map((d) => ({ id: d.id, ...d.data() }));

  return NextResponse.json({ users, total, page, limit });
}
