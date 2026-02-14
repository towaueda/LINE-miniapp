import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const user = await authenticateRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { code } = await request.json();
    if (!code) {
      return NextResponse.json({ error: "code required" }, { status: 400 });
    }

    const { data: invite } = await supabaseAdmin
      .from("invite_codes")
      .select("*")
      .eq("code", code)
      .eq("is_active", true)
      .is("used_by", null)
      .single();

    if (!invite) {
      return NextResponse.json({ error: "Invalid or used code" }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from("invite_codes")
      .update({
        used_by: user.id,
        used_at: new Date().toISOString(),
      })
      .eq("id", invite.id);

    if (error) {
      return NextResponse.json({ error: "Failed to use code" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
