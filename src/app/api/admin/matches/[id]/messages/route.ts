import { NextResponse } from "next/server";
import { verifyAdmin } from "../../../auth/route";
import { adminDb } from "@/lib/firebase/admin";

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  if (!(await verifyAdmin(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: groupId } = params;
  const url = new URL(request.url);
  const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get("limit") || "100", 10)));

  const snap = await adminDb
    .collection("messages")
    .where("group_id", "==", groupId)
    .orderBy("created_at", "desc")
    .limit(limit)
    .get();

  // 既存インデックス (group_id ASC, created_at DESC) を利用し、取得後に昇順へ反転
  const messages = snap.docs
    .map((d) => {
      const data = d.data();
      return {
        id: d.id,
        ...data,
        // Firestore Timestamp → ISO文字列に変換
        created_at: data.created_at?.toDate?.()?.toISOString() ?? data.created_at,
      };
    })
    .reverse();

  return NextResponse.json({ messages });
}
