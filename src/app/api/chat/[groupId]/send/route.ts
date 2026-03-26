import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { adminDb } from "@/lib/firebase/admin";
import { validateMessageText } from "@/lib/validation";
import { CHAT_DEADLINE_SUFFIX } from "@/types/constants";

export async function POST(
  request: Request,
  { params }: { params: { groupId: string } }
) {
  const authPromise = authenticateRequest(request);
  const bodyPromise = request.json();

  const user = await authPromise;
  if (!user) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const { groupId } = params;

  const [membershipSnap, groupDoc] = await Promise.all([
    adminDb
      .collection("match_group_members")
      .where("group_id", "==", groupId)
      .where("user_id", "==", user.id)
      .limit(1)
      .get(),
    adminDb.collection("match_groups").doc(groupId).get(),
  ]);

  if (membershipSnap.empty) {
    return NextResponse.json({ error: "このグループのメンバーではありません" }, { status: 403 });
  }

  if (!groupDoc.exists) {
    return NextResponse.json({ error: "グループが見つかりません" }, { status: 404 });
  }

  const group = groupDoc.data()!;

  if (group.status === "completed" || group.status === "cancelled") {
    return NextResponse.json({ error: "このグループのチャットは終了しています" }, { status: 403 });
  }

  const matchDate = new Date(group.date + CHAT_DEADLINE_SUFFIX);
  if (Date.now() > matchDate.getTime()) {
    return NextResponse.json({ error: "チャット期限が過ぎています" }, { status: 403 });
  }

  try {
    const { text } = await bodyPromise;

    const textError = validateMessageText(text);
    if (textError) {
      return NextResponse.json({ error: textError }, { status: 400 });
    }

    const now = new Date().toISOString();
    const msgRef = await adminDb.collection("messages").add({
      group_id: groupId,
      sender_id: user.id,
      sender_name: user.nickname || "???",
      text: text.trim(),
      is_system: false,
      created_at: now,
    });

    const msgDoc = await msgRef.get();
    return NextResponse.json({ message: { id: msgDoc.id, ...msgDoc.data() } });
  } catch {
    return NextResponse.json({ error: "サーバーエラーが発生しました" }, { status: 500 });
  }
}
