import { NextResponse } from "next/server";
import { verifyLineToken, getOrCreateUser } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const { accessToken } = await request.json();
    if (!accessToken) {
      return NextResponse.json({ error: "accessToken required" }, { status: 400 });
    }

    const lineProfile = await verifyLineToken(accessToken);
    if (!lineProfile) {
      return NextResponse.json({ error: "Invalid LINE token" }, { status: 401 });
    }

    const user = await getOrCreateUser(lineProfile.userId, lineProfile.displayName);
    if (!user) {
      return NextResponse.json({ error: "Failed to create user" }, { status: 500 });
    }

    if (user.is_banned) {
      return NextResponse.json({ error: "Account is banned" }, { status: 403 });
    }

    return NextResponse.json({ user });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
