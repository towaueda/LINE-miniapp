import { NextResponse } from "next/server";
import { verifyAdmin } from "../auth/route";
import { adminDb } from "@/lib/firebase/admin";

export async function GET(request: Request) {
  if (!(await verifyAdmin(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // waiting / two_person_offered / two_person_accepted のリクエストを取得
  const [waitingSnap, twoPersonSnap] = await Promise.all([
    adminDb.collection("match_requests").where("status", "==", "waiting").orderBy("created_at", "asc").get(),
    adminDb
      .collection("match_requests")
      .where("status", "in", ["two_person_offered", "two_person_accepted"])
      .orderBy("created_at", "asc")
      .get(),
  ]);

  const allDocs = [...waitingSnap.docs, ...twoPersonSnap.docs];

  // ユーザー情報をバッチ取得
  const userIds = Array.from(new Set(allDocs.map((d) => d.data().user_id as string)));
  const userDocs = await Promise.all(userIds.map((uid) => adminDb.collection("users").doc(uid).get()));
  const userMap: Record<string, { nickname: string; avatar_emoji: string }> = {};
  userDocs.forEach((d) => {
    if (d.exists) {
      userMap[d.id] = { nickname: d.data()!.nickname, avatar_emoji: d.data()!.avatar_emoji };
    }
  });

  // waiting リクエスト
  const waiting = waitingSnap.docs.map((d) => {
    const data = d.data();
    const user = userMap[data.user_id] || { nickname: "不明", avatar_emoji: "👤" };
    return {
      request_id: d.id,
      user_id: data.user_id,
      user_nickname: user.nickname,
      user_avatar_emoji: user.avatar_emoji,
      area: data.area,
      available_dates: (data.available_dates as string[]).sort(),
      status: data.status,
      created_at: data.created_at,
    };
  });

  // two_person_offered / two_person_accepted リクエストをペアに整理
  // two_person_partner_id は相手の request_id を指す
  const twoPersonMap = new Map(twoPersonSnap.docs.map((d) => [d.id, d]));
  const processedIds = new Set<string>();
  const twoPairs: {
    request_a: { request_id: string; user_id: string; user_nickname: string; user_avatar_emoji: string; status: string };
    request_b: { request_id: string; user_id: string; user_nickname: string; user_avatar_emoji: string; status: string } | null;
    area: string;
    common_dates: string[];
    created_at: string;
  }[] = [];

  for (const doc of twoPersonSnap.docs) {
    if (processedIds.has(doc.id)) continue;
    const data = doc.data();
    const userA = userMap[data.user_id] || { nickname: "不明", avatar_emoji: "👤" };
    const reqA = {
      request_id: doc.id,
      user_id: data.user_id,
      user_nickname: userA.nickname,
      user_avatar_emoji: userA.avatar_emoji,
      status: data.status,
    };

    const partnerId: string | null = data.two_person_partner_id || null;
    let reqB = null;
    let commonDates: string[] = (data.available_dates as string[]).sort();

    if (partnerId && twoPersonMap.has(partnerId)) {
      const partnerDoc = twoPersonMap.get(partnerId)!;
      const partnerData = partnerDoc.data();
      const userB = userMap[partnerData.user_id] || { nickname: "不明", avatar_emoji: "👤" };
      reqB = {
        request_id: partnerDoc.id,
        user_id: partnerData.user_id,
        user_nickname: userB.nickname,
        user_avatar_emoji: userB.avatar_emoji,
        status: partnerData.status,
      };
      const aDates: string[] = data.available_dates || [];
      const bDates: string[] = partnerData.available_dates || [];
      commonDates = aDates.filter((d) => bDates.includes(d)).sort();
      processedIds.add(partnerDoc.id);
    }

    processedIds.add(doc.id);
    twoPairs.push({
      request_a: reqA,
      request_b: reqB,
      area: data.area,
      common_dates: commonDates,
      created_at: data.created_at,
    });
  }

  return NextResponse.json({ waiting, two_pairs: twoPairs });
}
