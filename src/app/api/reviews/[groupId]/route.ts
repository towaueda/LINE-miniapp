import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { adminDb } from "@/lib/firebase/admin";

export async function GET(
  request: Request,
  { params }: { params: { groupId: string } }
) {
  const user = await authenticateRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { groupId } = params;

  const membershipSnap = await adminDb
    .collection("match_group_members")
    .where("group_id", "==", groupId)
    .where("user_id", "==", user.id)
    .limit(1)
    .get();

  if (membershipSnap.empty) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const reviewsSnap = await adminDb
    .collection("reviews")
    .where("group_id", "==", groupId)
    .get();

  const reviews = reviewsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  return NextResponse.json({ reviews });
}
