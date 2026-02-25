import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function POST(request: Request) {
  // auth と body parsing を並列開始
  const authPromise = authenticateRequest(request);
  const bodyPromise = request.json();

  const user = await authPromise;
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { groupId } = await bodyPromise;
    if (!groupId) {
      return NextResponse.json({ error: "groupId required" }, { status: 400 });
    }

    // Verify user is a member of this group
    const { data: membership } = await supabaseAdmin
      .from("match_group_members")
      .select("id")
      .eq("group_id", groupId)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: "Not a member" }, { status: 403 });
    }

    // Update group status to completed
    const { error } = await supabaseAdmin
      .from("match_groups")
      .update({ status: "completed" })
      .eq("id", groupId);

    if (error) {
      return NextResponse.json({ error: "Failed to complete" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
