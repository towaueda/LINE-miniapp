import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const { code } = await request.json();
    if (!code) {
      return NextResponse.json({ error: "code required" }, { status: 400 });
    }

    const { data } = await supabaseAdmin
      .from("invite_codes")
      .select("*")
      .eq("code", code)
      .eq("is_active", true)
      .is("used_by", null)
      .single();

    if (!data) {
      return NextResponse.json({ valid: false });
    }

    return NextResponse.json({ valid: true, invite: data });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
