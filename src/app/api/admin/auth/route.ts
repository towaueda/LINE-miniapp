import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { generateAdminToken, verifyAdminToken } from "@/lib/admin-token";

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";

export async function POST(request: Request) {
  try {
    const { password } = await request.json();

    if (!ADMIN_PASSWORD || password !== ADMIN_PASSWORD) {
      return NextResponse.json({ error: "Invalid password" }, { status: 401 });
    }

    const token = await generateAdminToken(ADMIN_PASSWORD);

    const response = NextResponse.json({ success: true });
    response.cookies.set("admin_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict", // CSRF対策: strict に変更
      path: "/",
      maxAge: 60 * 60 * 24, // 24 hours
    });

    return response;
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.delete("admin_token");
  return response;
}

// X-Admin-Password ヘッダーによるバイパスを削除し、cookieのHMACトークンのみで検証
export async function verifyAdmin(_request?: Request): Promise<boolean> {
  const cookieStore = await cookies();
  const token = cookieStore.get("admin_token")?.value;
  return verifyAdminToken(token ?? "", ADMIN_PASSWORD);
}
