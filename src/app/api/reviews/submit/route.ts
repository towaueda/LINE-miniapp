import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const user = await authenticateRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { groupId, reviews } = await request.json();

    if (!groupId || !reviews || !Array.isArray(reviews)) {
      return NextResponse.json({ error: "groupId and reviews required" }, { status: 400 });
    }

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

    // Check if already reviewed
    const { data: existing } = await supabaseAdmin
      .from("reviews")
      .select("id")
      .eq("group_id", groupId)
      .eq("reviewer_id", user.id)
      .limit(1);

    if (existing && existing.length > 0) {
      return NextResponse.json({ error: "Already reviewed" }, { status: 409 });
    }

    // Insert reviews
    const reviewInserts = reviews.map((r: {
      targetId: string;
      communication: number;
      punctuality: number;
      meetAgain: number;
      comment?: string;
    }) => ({
      group_id: groupId,
      reviewer_id: user.id,
      target_id: r.targetId,
      communication: r.communication,
      punctuality: r.punctuality,
      meet_again: r.meetAgain,
      comment: r.comment || null,
    }));

    const { error: reviewError } = await supabaseAdmin
      .from("reviews")
      .insert(reviewInserts);

    if (reviewError) {
      console.error("Review insert error:", reviewError);
      return NextResponse.json({ error: "Failed to save reviews" }, { status: 500 });
    }

    // Generate invite code
    const code = `TRI-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    await supabaseAdmin.from("invite_codes").insert({
      code,
      generated_by: user.id,
      group_id: groupId,
      is_active: true,
    });

    return NextResponse.json({ success: true, inviteCode: code });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
