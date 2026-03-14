import { NextResponse } from "next/server";
import { verifyAdmin } from "../auth/route";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function GET(request: Request) {
  if (!(await verifyAdmin(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 全クエリを単一のPromise.allで並列実行
  const [
    { count: totalUsers },
    { count: bannedUsers },
    { count: totalMatches },
    { count: activeMatches },
    { count: totalReviews },
    { count: totalInvites },
    { count: usedInvites },
    { data: reviewAvg },
    { data: recentUsers },
    { data: recentMatches },
  ] = await Promise.all([
    supabaseAdmin.from("users").select("*", { count: "exact", head: true }),
    supabaseAdmin.from("users").select("*", { count: "exact", head: true }).eq("is_banned", true),
    supabaseAdmin.from("match_groups").select("*", { count: "exact", head: true }),
    supabaseAdmin.from("match_groups").select("*", { count: "exact", head: true }).in("status", ["pending", "confirmed"]),
    supabaseAdmin.from("reviews").select("*", { count: "exact", head: true }),
    supabaseAdmin.from("invite_codes").select("*", { count: "exact", head: true }),
    supabaseAdmin.from("invite_codes").select("*", { count: "exact", head: true }).not("used_by", "is", null),
    supabaseAdmin.rpc("review_averages").single() as unknown as Promise<{ data: { avg_communication: number; avg_punctuality: number; avg_meet_again: number } | null }>,
    supabaseAdmin.from("users").select("id, nickname, created_at").order("created_at", { ascending: false }).limit(5),
    supabaseAdmin.from("match_groups").select("id, area, date, status, created_at").order("created_at", { ascending: false }).limit(5),
  ]);

  const avgCommunication = reviewAvg?.avg_communication ?? 0;
  const avgPunctuality = reviewAvg?.avg_punctuality ?? 0;
  const avgMeetAgain = reviewAvg?.avg_meet_again ?? 0;

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
