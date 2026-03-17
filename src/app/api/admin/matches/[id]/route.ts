import { NextResponse } from "next/server";
import { verifyAdmin } from "../../auth/route";
import { adminDb } from "@/lib/firebase/admin";

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  if (!(await verifyAdmin(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { status } = body;

    const VALID_STATUSES = new Set(["pending", "confirmed", "completed", "cancelled"]);
    if (!status || !VALID_STATUSES.has(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    await adminDb.collection("match_groups").doc(params.id).update({
      status,
      updated_at: new Date().toISOString(),
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
