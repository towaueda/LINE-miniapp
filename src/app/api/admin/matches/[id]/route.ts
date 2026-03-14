import { NextResponse } from "next/server";
import { verifyAdmin } from "../../auth/route";
import { supabaseAdmin } from "@/lib/supabase/server";

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

    const { error } = await supabaseAdmin
      .from("match_groups")
      .update({ status })
      .eq("id", params.id);

    if (error) {
      return NextResponse.json({ error: "Failed to update" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
