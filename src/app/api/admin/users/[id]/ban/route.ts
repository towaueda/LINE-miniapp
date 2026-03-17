import { NextResponse } from "next/server";
import { verifyAdmin } from "../../../auth/route";
import { adminDb } from "@/lib/firebase/admin";

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  if (!(await verifyAdmin(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const reason = body.reason || "";

    await adminDb.collection("users").doc(params.id).update({
      is_banned: true,
      ban_reason: reason,
      updated_at: new Date().toISOString(),
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  if (!(await verifyAdmin(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await adminDb.collection("users").doc(params.id).update({
      is_banned: false,
      ban_reason: null,
      updated_at: new Date().toISOString(),
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
