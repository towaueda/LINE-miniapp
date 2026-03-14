import { NextResponse } from "next/server";
import { createHash } from "crypto";

function verifyInviteCode(code: string): boolean {
  const hash = createHash("sha256").update(code).digest("hex");
  return hash === process.env.INVITE_CODE_HASH;
}

// インメモリレートリミッター（IP単位、1分間に10回まで）
interface RateEntry {
  count: number;
  resetAt: number;
}
const rateLimit = new Map<string, RateEntry>();
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimit.get(ip);

  if (!entry || entry.resetAt < now) {
    rateLimit.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    return false;
  }

  entry.count++;
  return true;
}

export async function POST(request: Request) {
  try {
    // IPアドレスを取得（プロキシ環境対応）
    const forwarded = request.headers.get("x-forwarded-for");
    const ip = forwarded ? forwarded.split(",")[0].trim() : "unknown";

    if (!checkRateLimit(ip)) {
      return NextResponse.json(
        { error: "Too many requests" },
        { status: 429, headers: { "Retry-After": "60" } }
      );
    }

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
