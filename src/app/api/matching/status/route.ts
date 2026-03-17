import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { adminDb } from "@/lib/firebase/admin";
import { getGroupWithMembers } from "@/lib/matching";

export async function GET(request: Request) {
  const user = await authenticateRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // ユーザーの参加グループ + アクティブリクエストを並列取得
    const [membersSnap, activeReqSnap] = await Promise.all([
      adminDb.collection("match_group_members").where("user_id", "==", user.id).get(),
      adminDb
        .collection("match_requests")
        .where("user_id", "==", user.id)
        .where("status", "in", ["waiting", "two_person_offered", "two_person_accepted", "no_match"])
        .orderBy("created_at", "desc")
        .limit(1)
        .get(),
    ]);

    // グループIDを取得してステータスを確認
    let hasPendingReview = false;
    const activeGroupIds: string[] = [];

    if (!membersSnap.empty) {
      const groupIds = membersSnap.docs.map((d) => d.data().group_id as string);
      const groupDocs = await Promise.all(
        groupIds.map((id) => adminDb.collection("match_groups").doc(id).get())
      );

      const completedGroupIds: string[] = [];
      for (const d of groupDocs) {
        if (!d.exists) continue;
        const status = d.data()!.status;
        if (status === "completed") completedGroupIds.push(d.id);
        if (status === "pending" || status === "confirmed") activeGroupIds.push(d.id);
      }

      if (completedGroupIds.length > 0) {
        const reviewCounts = await Promise.all(
          completedGroupIds.map((id) =>
            adminDb
              .collection("reviews")
              .where("group_id", "==", id)
              .where("reviewer_id", "==", user.id)
              .limit(1)
              .get()
          )
        );
        hasPendingReview = reviewCounts.some((snap) => snap.empty);
      }
    }

    if (!activeReqSnap.empty) {
      const activeReqDoc = activeReqSnap.docs[0];
      const activeReq = { id: activeReqDoc.id, ...activeReqDoc.data() } as {
        id: string;
        status: string;
        available_dates: string[];
        two_person_partner_id?: string;
        updated_at: string;
      };

      if (activeReq.status === "two_person_offered" || activeReq.status === "two_person_accepted") {
        let proposedDates: string[] = [];
        if (activeReq.two_person_partner_id) {
          const partnerDoc = await adminDb
            .collection("match_requests")
            .doc(activeReq.two_person_partner_id)
            .get();

          if (partnerDoc.exists) {
            const today = new Date().toISOString().split("T")[0];
            const myDates: string[] = activeReq.available_dates || [];
            const partnerDates: string[] = partnerDoc.data()!.available_dates || [];
            const partnerSet = new Set(partnerDates);
            proposedDates = myDates.filter((d) => partnerSet.has(d) && d >= today).sort();
          }
        }

        return NextResponse.json({
          status: "two_person_offered",
          requestId: activeReq.id,
          proposedDates,
          hasPendingReview,
        });
      }

      if (activeReq.status === "no_match") {
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        if (activeReq.updated_at >= sevenDaysAgo) {
          return NextResponse.json({ status: "no_match", hasPendingReview });
        }
      } else if (activeReq.status === "waiting") {
        return NextResponse.json({ status: "waiting", request: activeReq, hasPendingReview });
      }
    }

    if (activeGroupIds.length > 0) {
      const result = await getGroupWithMembers(activeGroupIds[0]);
      if (result) {
        return NextResponse.json({
          status: "matched",
          group: result.group,
          members: result.members,
          hasPendingReview,
        });
      }
    }

    return NextResponse.json({ status: "idle", hasPendingReview });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
