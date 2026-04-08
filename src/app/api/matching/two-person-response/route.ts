import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { confirmTwoPersonMatch, declineTwoPersonMatch, getGroupWithMembers } from "@/lib/matching";

export async function POST(request: Request) {
  const user = await authenticateRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!user.is_approved) {
    return NextResponse.json({ error: "アカウントが未承認です" }, { status: 403 });
  }
  if (user.is_banned) {
    return NextResponse.json({ error: "アカウントが停止されています" }, { status: 403 });
  }

  try {
    const { action, requestId } = await request.json();

    if (action !== "accept" && action !== "decline") {
      return NextResponse.json({ error: "無効なアクションです" }, { status: 400 });
    }

    const { adminDb } = await import("@/lib/firebase/admin");
    let matchReqId: string;

    if (requestId) {
      const doc = await adminDb.collection("match_requests").doc(requestId).get();
      if (!doc.exists || doc.data()?.user_id !== user.id || doc.data()?.status !== "two_person_offered") {
        return NextResponse.json({ error: "2人マッチングオファーが見つかりません" }, { status: 404 });
      }
      matchReqId = doc.id;
    } else {
      const matchReqSnap = await adminDb
        .collection("match_requests")
        .where("user_id", "==", user.id)
        .where("status", "==", "two_person_offered")
        .orderBy("created_at", "desc")
        .limit(1)
        .get();

      if (matchReqSnap.empty) {
        return NextResponse.json({ error: "2人マッチングオファーが見つかりません" }, { status: 404 });
      }
      matchReqId = matchReqSnap.docs[0].id;
    }

    if (action === "accept") {
      const groupId = await confirmTwoPersonMatch(matchReqId);

      if (groupId) {
        const result = await getGroupWithMembers(groupId);
        if (result) {
          return NextResponse.json({ status: "matched", group: result.group, members: result.members });
        }
      }

      return NextResponse.json({ status: "waiting_for_partner" });
    }

    // action === 'decline'
    await declineTwoPersonMatch(matchReqId);
    return NextResponse.json({ status: "no_match" });
  } catch {
    return NextResponse.json({ error: "サーバーエラーが発生しました" }, { status: 500 });
  }
}
