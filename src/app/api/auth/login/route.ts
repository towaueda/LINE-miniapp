import { NextResponse } from "next/server";
import { verifyLineToken, getOrCreateUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/server";
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

    // If invite code provided and user not yet approved, validate via hash
    if (inviteCode && !user.is_approved) {
      if (verifyInviteCode(inviteCode.trim())) {
        await supabaseAdmin
          .from("users")
          .update({ is_approved: true, invited_by_code: "master" })
          .eq("id", user.id);

        const updatedUser = { ...user, is_approved: true, invited_by_code: "master" };
        return NextResponse.json({ user: updatedUser });
      }
    }

    return NextResponse.json({ user });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
