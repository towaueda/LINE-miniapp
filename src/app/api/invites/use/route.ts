import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { adminDb } from "@/lib/firebase/admin";

export async function POST(request: Request) {
  const authPromise = authenticateRequest(request);
  const bodyPromise = request.json();

  const user = await authPromise;
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { code } = await bodyPromise;
    if (!code) {
      return NextResponse.json({ error: "code required" }, { status: 400 });
    }

    const inviteSnap = await adminDb
      .collection("invite_codes")
      .where("code", "==", code)
      .where("is_active", "==", true)
      .where("used_by", "==", null)
      .limit(1)
      .get();

    if (inviteSnap.empty) {
      return NextResponse.json({ error: "Invalid or used code" }, { status: 400 });
    }

    const inviteDoc = inviteSnap.docs[0];
    await inviteDoc.ref.update({
      used_by: user.id,
      used_at: new Date().toISOString(),
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
