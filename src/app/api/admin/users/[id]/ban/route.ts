import { NextResponse } from "next/server";
import { verifyAdmin } from "../../../auth/route";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  if (!verifyAdmin(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const reason = body.reason || "";

    const { error } = await supabaseAdmin
      .from("users")
      .update({ is_banned: true, ban_reason: reason })
      .eq("id", params.id);

    if (error) {
      return NextResponse.json({ error: "Failed to ban user" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  if (!verifyAdmin(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { error } = await supabaseAdmin
    .from("users")
    .update({ is_banned: false, ban_reason: null })
    .eq("id", params.id);

  if (error) {
    return NextResponse.json({ error: "Failed to unban user" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
