import { NextResponse } from "next/server";
import { verifyLineToken, getOrCreateUser } from "@/lib/auth";
import { adminDb } from "@/lib/firebase/admin";
import { createHash } from "crypto";

function verifyInviteCode(code: string): boolean {
  const hash = createHash("sha256").update(code).digest("hex");
  return hash === process.env.INVITE_CODE_HASH;
}

export async function POST(request: Request) {
  try {
    const { accessToken, inviteCode } = await request.json();
    if (!accessToken) {
      return NextResponse.json({ error: "accessToken required" }, { status: 400 });
    }

    const lineProfile = await verifyLineToken(accessToken);
    if (!lineProfile) {
      return NextResponse.json({ error: "Invalid LINE token" }, { status: 401 });
    }

    const user = await getOrCreateUser(lineProfile.userId, lineProfile.displayName, inviteCode);
    if (!user) {
      return NextResponse.json({ error: "Failed to create user" }, { status: 500 });
    }

    if (user.is_banned) {
      return NextResponse.json({ error: "Account is banned" }, { status: 403 });
    }

    if (inviteCode && !user.is_approved) {
      const trimmedCode = inviteCode.trim();

      // マスターコードをチェック
      if (verifyInviteCode(trimmedCode)) {
        await adminDb.collection("users").doc(user.id).update({
          is_approved: true,
          invited_by_code: "master",
          updated_at: new Date().toISOString(),
        });
        const updatedUser = { ...user, is_approved: true, invited_by_code: "master" };
        return NextResponse.json({ user: updatedUser });
      }

      // ユーザー生成招待コード（TRI-XXXXXX）をチェック
      const inviteSnap = await adminDb
        .collection("invite_codes")
        .where("code", "==", trimmedCode)
        .where("is_active", "==", true)
        .where("used_by", "==", null)
        .limit(1)
        .get();

      if (!inviteSnap.empty) {
        const inviteDoc = inviteSnap.docs[0];
        const now = new Date().toISOString();
        await Promise.all([
          adminDb.collection("users").doc(user.id).update({
            is_approved: true,
            invited_by_code: trimmedCode,
            updated_at: now,
          }),
          inviteDoc.ref.update({
            used_by: user.id,
            used_at: now,
          }),
        ]);
        const updatedUser = { ...user, is_approved: true, invited_by_code: trimmedCode };
        return NextResponse.json({ user: updatedUser });
      }
    }

    return NextResponse.json({ user });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
