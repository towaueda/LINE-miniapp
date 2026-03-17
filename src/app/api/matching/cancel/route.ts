import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { adminDb } from "@/lib/firebase/admin";

export async function POST(request: Request) {
  const user = await authenticateRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const snap = await adminDb
      .collection("match_requests")
      .where("user_id", "==", user.id)
      .where("status", "==", "waiting")
      .get();

    if (snap.empty) {
      return NextResponse.json({ success: true });
    }

    const batch = adminDb.batch();
    snap.docs.forEach((doc) => {
      batch.update(doc.ref, { status: "cancelled", updated_at: new Date().toISOString() });
    });
    await batch.commit();

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
