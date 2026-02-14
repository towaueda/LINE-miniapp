import { NextResponse } from "next/server";
import { verifyAdmin } from "../auth/route";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function GET(request: Request) {
  if (!verifyAdmin(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [
    { count: totalUsers },
    { count: bannedUsers },
    { count: totalMatches },
    { count: activeMatches },
    { count: totalReviews },
    { count: totalInvites },
    { count: usedInvites },
  ] = await Promise.all([
    supabaseAdmin.from("users").select("*", { count: "exact", head: true }),
    supabaseAdmin.from("users").select("*", { count: "exact", head: true }).eq("is_banned", true),
    supabaseAdmin.from("match_groups").select("*", { count: "exact", head: true }),
    supabaseAdmin.from("match_groups").select("*", { count: "exact", head: true }).in("status", ["pending", "confirmed"]),
    supabaseAdmin.from("reviews").select("*", { count: "exact", head: true }),
    supabaseAdmin.from("invite_codes").select("*", { count: "exact", head: true }),
    supabaseAdmin.from("invite_codes").select("*", { count: "exact", head: true }).not("used_by", "is", null),
  ]);

  // Average review scores
  const { data: reviewAvg } = await supabaseAdmin
    .from("reviews")
    .select("communication, punctuality, meet_again");

  let avgCommunication = 0;
  let avgPunctuality = 0;
  let avgMeetAgain = 0;
  if (reviewAvg && reviewAvg.length > 0) {
    avgCommunication = reviewAvg.reduce((s, r) => s + r.communication, 0) / reviewAvg.length;
    avgPunctuality = reviewAvg.reduce((s, r) => s + r.punctuality, 0) / reviewAvg.length;
    avgMeetAgain = reviewAvg.reduce((s, r) => s + r.meet_again, 0) / reviewAvg.length;
  }

  // Recent activity
  const { data: recentUsers } = await supabaseAdmin
    .from("users")
    .select("id, nickname, created_at")
    .order("created_at", { ascending: false })
    .limit(5);

  const { data: recentMatches } = await supabaseAdmin
    .from("match_groups")
    .select("id, area, date, status, created_at")
    .order("created_at", { ascending: false })
    .limit(5);

  return NextResponse.json({
    stats: {
      totalUsers: totalUsers || 0,
      bannedUsers: bannedUsers || 0,
      totalMatches: totalMatches || 0,
      activeMatches: activeMatches || 0,
      totalReviews: totalReviews || 0,
      totalInvites: totalInvites || 0,
      usedInvites: usedInvites || 0,
      avgCommunication: Math.round(avgCommunication * 10) / 10,
      avgPunctuality: Math.round(avgPunctuality * 10) / 10,
      avgMeetAgain: Math.round(avgMeetAgain * 10) / 10,
    },
    recentUsers: recentUsers || [],
    recentMatches: recentMatches || [],
  });
}
