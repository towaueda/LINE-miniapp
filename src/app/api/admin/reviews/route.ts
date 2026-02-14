import { NextResponse } from "next/server";
import { verifyAdmin } from "../auth/route";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function GET(request: Request) {
  if (!verifyAdmin(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get("page") || "1");
  const limit = parseInt(url.searchParams.get("limit") || "20");
  const minRating = url.searchParams.get("minRating");
  const maxRating = url.searchParams.get("maxRating");
  const offset = (page - 1) * limit;

  let query = supabaseAdmin
    .from("reviews")
    .select("*, reviewer:users!reviewer_id(nickname, avatar_emoji), target:users!target_id(nickname, avatar_emoji)", { count: "exact" });

  if (minRating) {
    const min = parseInt(minRating);
    query = query.gte("communication", min);
  }
  if (maxRating) {
    const max = parseInt(maxRating);
    query = query.lte("communication", max);
  }

  const { data, count, error } = await query
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    return NextResponse.json({ error: "Failed to fetch reviews" }, { status: 500 });
  }

  return NextResponse.json({
    reviews: data || [],
    total: count || 0,
    page,
    limit,
  });
}
