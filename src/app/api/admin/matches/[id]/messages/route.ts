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
    .orderBy("created_at", "asc")
    .limit(limit)
    .get();

  const messages = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  return NextResponse.json({ messages });
}
