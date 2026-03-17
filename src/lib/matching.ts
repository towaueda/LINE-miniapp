import { adminDb } from "@/lib/firebase/admin";

/**
 * try_match_atomic の代替：新規リクエストに対してマッチングを試みる
 * 同じエリア・日程が重なる waiting リクエストを3件集めてグループ化する
 * トランザクションで排他制御を行う
 */
export async function tryMatch(newRequestId: string): Promise<string | null> {
  return adminDb.runTransaction(async (tx) => {
    const newReqRef = adminDb.collection("match_requests").doc(newRequestId);
    const newReqDoc = await tx.get(newReqRef);
    if (!newReqDoc.exists) return null;

    const newReq = newReqDoc.data()!;
    if (newReq.status !== "waiting") return null;

    const area: string = newReq.area;
    const availableDates: string[] = newReq.available_dates || [];

    // 同じエリアの waiting リクエストを取得（自分以外）
    const waitingSnap = await adminDb
      .collection("match_requests")
      .where("area", "==", area)
      .where("status", "==", "waiting")
      .get();

    // 日程が1日以上重なるリクエストを絞り込む
    const myDateSet = new Set(availableDates);
    const candidates = waitingSnap.docs.filter((doc) => {
      if (doc.id === newRequestId) return false;
      const dates: string[] = doc.data().available_dates || [];
      return dates.some((d) => myDateSet.has(d));
    });

    if (candidates.length < 2) return null; // 3人揃わない

    // 3人分の共通日程を探す
    const pair = candidates.slice(0, 2);
    const pairDates0: string[] = pair[0].data().available_dates || [];
    const pairDates1: string[] = pair[1].data().available_dates || [];

    const commonDates = availableDates.filter(
      (d) => pairDates0.includes(d) && pairDates1.includes(d)
    );

    if (commonDates.length === 0) return null;

    // 最も早い共通日程を選択
    const matchDate = commonDates.sort()[0];

    // グループ作成
    const groupRef = adminDb.collection("match_groups").doc();
    const now = new Date().toISOString();
    tx.set(groupRef, {
      area,
      date: matchDate,
      time: "19:00",
      restaurant_id: null,
      restaurant_name: "未定",
      status: "pending",
      created_at: now,
      updated_at: now,
    });

    // メンバー追加（自分 + pair 2人）
    const allReqDocs = [newReqDoc, ...pair];
    for (const reqDoc of allReqDocs) {
      const memberRef = adminDb.collection("match_group_members").doc();
      tx.set(memberRef, {
        group_id: groupRef.id,
        user_id: reqDoc.data()!.user_id,
        joined_at: now,
        completed_at: null,
      });

      // リクエストを matched に更新
      tx.update(reqDoc.ref, {
        status: "matched",
        matched_group_id: groupRef.id,
        updated_at: now,
      });
    }

    return groupRef.id;
  });
}

/**
 * expire_old_match_requests の代替：期限切れ waiting リクエストをキャンセル
 */
export async function expireOldMatchRequests(): Promise<void> {
  const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
  const snap = await adminDb
    .collection("match_requests")
    .where("status", "==", "waiting")
    .where("created_at", "<", twoDaysAgo)
    .get();

  const batch = adminDb.batch();
  snap.docs.forEach((doc) => {
    batch.update(doc.ref, { status: "expired", updated_at: new Date().toISOString() });
  });
  await batch.commit();
}

/**
 * offer_two_person_matches の代替：2人マッチのオファーを送る
 * 返り値: オファーした件数
 */
export async function offerTwoPersonMatches(): Promise<number> {
  const snap = await adminDb
    .collection("match_requests")
    .where("status", "==", "waiting")
    .get();

  // エリア別にグループ化
  const byArea: Record<string, FirebaseFirestore.QueryDocumentSnapshot[]> = {};
  for (const doc of snap.docs) {
    const area = doc.data().area;
    if (!byArea[area]) byArea[area] = [];
    byArea[area].push(doc);
  }

  let offered = 0;
  const batch = adminDb.batch();
  const now = new Date().toISOString();

  for (const docs of Object.values(byArea)) {
    // 日程が重なるペアを探す
    for (let i = 0; i < docs.length; i++) {
      for (let j = i + 1; j < docs.length; j++) {
        const a = docs[i];
        const b = docs[j];
        const aDates: string[] = a.data().available_dates || [];
        const bDates: string[] = b.data().available_dates || [];
        const overlap = aDates.filter((d) => bDates.includes(d));
        if (overlap.length > 0) {
          batch.update(a.ref, {
            status: "two_person_offered",
            two_person_partner_id: b.id,
            updated_at: now,
          });
          batch.update(b.ref, {
            status: "two_person_offered",
            two_person_partner_id: a.id,
            updated_at: now,
          });
          offered++;
          // マッチ済みにしたドキュメントを次のループで使わないようにする
          docs.splice(j, 1);
          docs.splice(i, 1);
          i--;
          break;
        }
      }
    }
  }

  await batch.commit();
  return offered;
}

/**
 * expire_no_match_requests の代替：7日以上前の no_match リクエストを expired に
 */
export async function expireNoMatchRequests(): Promise<number> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const snap = await adminDb
    .collection("match_requests")
    .where("status", "==", "no_match")
    .where("updated_at", "<", sevenDaysAgo)
    .get();

  const batch = adminDb.batch();
  snap.docs.forEach((doc) => {
    batch.update(doc.ref, { status: "expired", updated_at: new Date().toISOString() });
  });
  await batch.commit();
  return snap.size;
}

/**
 * confirm_two_person_match の代替：2人マッチを承諾
 * 両者が承諾済みならグループ作成
 */
export async function confirmTwoPersonMatch(requestId: string): Promise<string | null> {
  return adminDb.runTransaction(async (tx) => {
    const reqRef = adminDb.collection("match_requests").doc(requestId);
    const reqDoc = await tx.get(reqRef);
    if (!reqDoc.exists) return null;

    const req = reqDoc.data()!;
    if (req.status !== "two_person_offered") return null;

    const partnerId: string = req.two_person_partner_id;
    if (!partnerId) return null;

    const partnerRef = adminDb.collection("match_requests").doc(partnerId);
    const partnerDoc = await tx.get(partnerRef);
    if (!partnerDoc.exists) return null;

    const partner = partnerDoc.data()!;
    const now = new Date().toISOString();

    // 相手がまだ two_person_offered なら自分だけ accepted にして待機
    if (partner.status !== "two_person_accepted") {
      tx.update(reqRef, { status: "two_person_accepted", updated_at: now });
      return null;
    }

    // 両者承諾済み → グループ作成
    const aDates: string[] = req.available_dates || [];
    const bDates: string[] = partner.available_dates || [];
    const common = aDates.filter((d) => bDates.includes(d)).sort();
    if (common.length === 0) return null;

    const matchDate = common[0];
    const groupRef = adminDb.collection("match_groups").doc();
    tx.set(groupRef, {
      area: req.area,
      date: matchDate,
      time: "19:00",
      restaurant_id: null,
      restaurant_name: "未定",
      status: "pending",
      created_at: now,
      updated_at: now,
    });

    for (const r of [reqDoc, partnerDoc]) {
      const memberRef = adminDb.collection("match_group_members").doc();
      tx.set(memberRef, {
        group_id: groupRef.id,
        user_id: r.data()!.user_id,
        joined_at: now,
        completed_at: null,
      });
      tx.update(r.ref, {
        status: "matched",
        matched_group_id: groupRef.id,
        updated_at: now,
      });
    }

    return groupRef.id;
  });
}

/**
 * decline_two_person_match の代替：2人マッチを辞退
 */
export async function declineTwoPersonMatch(requestId: string): Promise<void> {
  return adminDb.runTransaction(async (tx) => {
    const reqRef = adminDb.collection("match_requests").doc(requestId);
    const reqDoc = await tx.get(reqRef);
    if (!reqDoc.exists) return;

    const req = reqDoc.data()!;
    const now = new Date().toISOString();

    tx.update(reqRef, { status: "no_match", updated_at: now });

    if (req.two_person_partner_id) {
      const partnerRef = adminDb.collection("match_requests").doc(req.two_person_partner_id);
      tx.update(partnerRef, { status: "no_match", updated_at: now });
    }
  });
}

/**
 * グループとそのメンバー情報（ユーザー詳細含む）を取得
 */
export async function getGroupWithMembers(groupId: string) {
  const [groupDoc, membersSnap] = await Promise.all([
    adminDb.collection("match_groups").doc(groupId).get(),
    adminDb.collection("match_group_members").where("group_id", "==", groupId).get(),
  ]);

  if (!groupDoc.exists) return null;

  const userIds = membersSnap.docs.map((m) => m.data().user_id);
  const userDocs = await Promise.all(
    userIds.map((uid) => adminDb.collection("users").doc(uid).get())
  );

  const members = userDocs
    .filter((d) => d.exists)
    .map((d) => ({
      id: d.id,
      nickname: d.data()!.nickname,
      birth_year: d.data()!.birth_year,
      industry: d.data()!.industry,
      avatar_emoji: d.data()!.avatar_emoji,
      bio: d.data()!.bio,
    }));

  return {
    group: { id: groupDoc.id, ...groupDoc.data() },
    members,
  };
}
