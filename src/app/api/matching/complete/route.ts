import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { adminDb } from "@/lib/firebase/admin";

export async function POST(request: Request) {
  const authPromise = authenticateRequest(request);
  const bodyPromise = request.json();

  const user = await authPromise;
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { groupId } = await bodyPromise;
    if (!groupId) {
      return NextResponse.json({ error: "groupId required" }, { status: 400 });
    }

    const membersSnap = await adminDb
      .collection("match_group_members")
      .where("group_id", "==", groupId)
      .get();

    if (membersSnap.empty) {
      return NextResponse.json({ error: "Not a member" }, { status: 403 });
    }

    const members = membersSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as {
      id: string;
      user_id: string;
      completed_at: string | null;
    }[];

    const myMember = members.find((m) => m.user_id === user.id);
    if (!myMember) {
      return NextResponse.json({ error: "Not a member" }, { status: 403 });
    }

    if (!myMember.completed_at) {
      await adminDb.collection("match_group_members").doc(myMember.id).update({
        completed_at: new Date().toISOString(),
      });
    }

    const confirmed = members.filter((m) => m.completed_at || m.user_id === user.id).length;
    const total = members.length;

    if (confirmed === total) {
      await adminDb.collection("match_groups").doc(groupId).update({
        status: "completed",
        updated_at: new Date().toISOString(),
      });
    }

    return NextResponse.json({ confirmed, total, allConfirmed: confirmed === total });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
