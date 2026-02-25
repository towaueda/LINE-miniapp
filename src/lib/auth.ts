import { supabaseAdmin } from "@/lib/supabase/server";
import type { DbUser } from "@/types";

// --- LINE トークン検証キャッシュ（インメモリ、TTL 5分、最大500件） ---
const TOKEN_CACHE_TTL = 5 * 60 * 1000; // 5分
const TOKEN_CACHE_MAX = 500;

interface CachedProfile {
  userId: string;
  displayName: string;
  expiresAt: number;
}

const tokenCache = new Map<string, CachedProfile>();

function pruneTokenCache() {
  // Map は挿入順を保持するため、先頭から削除すれば最も古いエントリが消える（O(1)）
  while (tokenCache.size > TOKEN_CACHE_MAX) {
    const firstKey = tokenCache.keys().next().value;
    if (firstKey !== undefined) tokenCache.delete(firstKey);
    else break;
  }
}

export async function verifyLineToken(accessToken: string): Promise<{ userId: string; displayName: string } | null> {
  // キャッシュを先に確認
  const cached = tokenCache.get(accessToken);
  if (cached && cached.expiresAt > Date.now()) {
    return { userId: cached.userId, displayName: cached.displayName };
  }
  // 期限切れのエントリを削除
  if (cached) tokenCache.delete(accessToken);

  try {
    const res = await fetch("https://api.line.me/v2/profile", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const profile = await res.json();
    const result = { userId: profile.userId, displayName: profile.displayName };

    // 結果をキャッシュ
    tokenCache.set(accessToken, {
      ...result,
      expiresAt: Date.now() + TOKEN_CACHE_TTL,
    });
    pruneTokenCache();

    return result;
  } catch {
    return null;
  }
}

export async function getOrCreateUser(lineUserId: string, displayName: string, inviteCode?: string): Promise<DbUser | null> {
  const { data: existing } = await supabaseAdmin
    .from("users")
    .select("*")
    .eq("line_user_id", lineUserId)
    .single();

  if (existing) return existing as DbUser;

  const { data: created, error } = await supabaseAdmin
    .from("users")
    .insert({
      line_user_id: lineUserId,
      nickname: displayName,
      avatar_emoji: "😊",
      is_approved: false,
      invited_by_code: inviteCode || null,
    })
    .select()
    .single();

  if (error) {
    console.error("ユーザー作成失敗:", error);
    return null;
  }

  return created as DbUser;
}

export async function getUserByLineId(lineUserId: string): Promise<DbUser | null> {
  const { data } = await supabaseAdmin
    .from("users")
    .select("*")
    .eq("line_user_id", lineUserId)
    .single();

  return data as DbUser | null;
}

export async function getUserById(userId: string): Promise<DbUser | null> {
  const { data } = await supabaseAdmin
    .from("users")
    .select("*")
    .eq("id", userId)
    .single();

  return data as DbUser | null;
}

export async function authenticateRequest(request: Request): Promise<DbUser | null> {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.slice(7);

  // LINEアクセストークンとして検証
  const lineProfile = await verifyLineToken(token);
  if (!lineProfile) return null;

  return getUserByLineId(lineProfile.userId);
}
