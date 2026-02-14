import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function POST(
  request: Request,
  { params }: { params: { groupId: string } }
) {
  const user = await authenticateRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { groupId } = params;

  // Verify membership
  const { data: membership } = await supabaseAdmin
    .from("match_group_members")
    .select("id")
    .eq("group_id", groupId)
    .eq("user_id", user.id)
    .single();

  if (!membership) {
    return NextResponse.json({ error: "Not a member" }, { status: 403 });
  }

  try {
    const { text } = await request.json();
    if (!text?.trim()) {
      return NextResponse.json({ error: "text required" }, { status: 400 });
    }

    const { data: message, error } = await supabaseAdmin
      .from("messages")
      .insert({
        group_id: groupId,
        sender_id: user.id,
        sender_name: user.nickname || "???",
        text: text.trim(),
        is_system: false,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: "Failed to send" }, { status: 500 });
    }

    return NextResponse.json({ message });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
