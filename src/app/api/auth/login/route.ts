import { NextResponse } from "next/server";
import { verifyLineToken, getOrCreateUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/server";

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

    // If invite code provided and user not yet approved, process it
    if (inviteCode && !user.is_approved) {
      const { data: invite } = await supabaseAdmin
        .from("invite_codes")
        .select("*")
        .eq("code", inviteCode)
        .eq("is_active", true)
        .is("used_by", null)
        .single();

      if (invite) {
        // Mark invite as used
        await supabaseAdmin
          .from("invite_codes")
          .update({ used_by: user.id, used_at: new Date().toISOString() })
          .eq("id", invite.id);

        // Approve user
        await supabaseAdmin
          .from("users")
          .update({ is_approved: true, invited_by_code: inviteCode })
          .eq("id", user.id);

        const updatedUser = { ...user, is_approved: true, invited_by_code: inviteCode };
        return NextResponse.json({ user: updatedUser });
      }
    }

    return NextResponse.json({ user });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
