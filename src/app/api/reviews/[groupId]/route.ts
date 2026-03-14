import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function GET(
  request: Request,
  { params }: { params: { groupId: string } }
) {
  const user = await authenticateRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { groupId } = params;

  // リクエストしたユーザーがそのグループのメンバーであることを確認
  const { data: membership, error: memberError } = await supabaseAdmin
    .from("match_group_members")
    .select("id")
    .eq("group_id", groupId)
    .eq("user_id", user.id)
    .single();

  if (memberError || !membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: reviews, error } = await supabaseAdmin
    .from("reviews")
    .select("*")
    .eq("group_id", groupId);

  if (error) {
    return NextResponse.json({ error: "Failed to load reviews" }, { status: 500 });
  }

  return NextResponse.json({ reviews: reviews || [] });
}
