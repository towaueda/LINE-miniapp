import { NextResponse } from "next/server";
import { createHash } from "crypto";

function verifyInviteCode(code: string): boolean {
  const hash = createHash("sha256").update(code).digest("hex");
  return hash === process.env.INVITE_CODE_HASH;
}

export async function POST(request: Request) {
  try {
    const { code } = await request.json();
    if (!code) {
      return NextResponse.json({ error: "code required" }, { status: 400 });
    }

    const valid = verifyInviteCode(code.trim());
    return NextResponse.json({ valid });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
