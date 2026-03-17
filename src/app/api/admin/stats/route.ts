import { NextResponse } from "next/server";
import { verifyAdmin } from "../auth/route";
import { adminDb } from "@/lib/firebase/admin";

export async function GET(request: Request) {
  if (!(await verifyAdmin(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [
    usersSnap,
    matchGroupsSnap,
    reviewsSnap,
    inviteCodesSnap,
    recentUsersSnap,
    recentMatchesSnap,
  ] = await Promise.all([
    adminDb.collection("users").get(),
    adminDb.collection("match_groups").get(),
    adminDb.collection("reviews").get(),
    adminDb.collection("invite_codes").get(),
    adminDb.collection("users").orderBy("created_at", "desc").limit(5).get(),
    adminDb.collection("match_groups").orderBy("created_at", "desc").limit(5).get(),
  ]);

  const totalUsers = usersSnap.size;
  const bannedUsers = usersSnap.docs.filter((d) => d.data().is_banned).length;
  const totalMatches = matchGroupsSnap.size;
  const activeMatches = matchGroupsSnap.docs.filter((d) =>
    ["pending", "confirmed"].includes(d.data().status)
  ).length;
  const totalReviews = reviewsSnap.size;
  const totalInvites = inviteCodesSnap.size;
  const usedInvites = inviteCodesSnap.docs.filter((d) => d.data().used_by !== null).length;

  // レビュー平均を計算
  let sumCommunication = 0, sumPunctuality = 0, sumMeetAgain = 0;
  reviewsSnap.docs.forEach((d) => {
    sumCommunication += d.data().communication || 0;
    sumPunctuality += d.data().punctuality || 0;
    sumMeetAgain += d.data().meet_again || 0;
  });
  const count = reviewsSnap.size || 1;
  const avgCommunication = Math.round((sumCommunication / count) * 10) / 10;
  const avgPunctuality = Math.round((sumPunctuality / count) * 10) / 10;
  const avgMeetAgain = Math.round((sumMeetAgain / count) * 10) / 10;

  const recentUsers = recentUsersSnap.docs.map((d) => ({
    id: d.id,
    nickname: d.data().nickname,
    created_at: d.data().created_at,
  }));
  const recentMatches = recentMatchesSnap.docs.map((d) => ({
    id: d.id,
    area: d.data().area,
    date: d.data().date,
    status: d.data().status,
    created_at: d.data().created_at,
  }));

  return NextResponse.json({
    stats: {
      totalUsers,
      bannedUsers,
      totalMatches,
      activeMatches,
      totalReviews,
      totalInvites,
      usedInvites,
      avgCommunication,
      avgPunctuality,
      avgMeetAgain,
    },
    recentUsers,
    recentMatches,
  });
}
