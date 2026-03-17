import { adminDb } from "@/lib/firebase/admin";
import type { DbUser } from "@/types";

// --- LINE トークン検証キャッシュ（インメモリ、TTL 1分、最大500件） ---
const TOKEN_CACHE_TTL = 60 * 1000;
const TOKEN_CACHE_MAX = 500;

interface CachedProfile {
  userId: string;
  displayName: string;
  expiresAt: number;
}

const tokenCache = new Map<string, CachedProfile>();

function pruneTokenCache() {
  while (tokenCache.size > TOKEN_CACHE_MAX) {
    const firstKey = tokenCache.keys().next().value;
    if (firstKey !== undefined) tokenCache.delete(firstKey);
    else break;
  }
}

export async function verifyLineToken(accessToken: string): Promise<{ userId: string; displayName: string } | null> {
  const cached = tokenCache.get(accessToken);
  if (cached && cached.expiresAt > Date.now()) {
    return { userId: cached.userId, displayName: cached.displayName };
  }
  if (cached) tokenCache.delete(accessToken);

  try {
    const res = await fetch("https://api.line.me/v2/profile", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const profile = await res.json();
    const result = { userId: profile.userId, displayName: profile.displayName };

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
  const usersRef = adminDb.collection("users");
  const snapshot = await usersRef.where("line_user_id", "==", lineUserId).limit(1).get();

  if (!snapshot.empty) {
    const doc = snapshot.docs[0];
    return { id: doc.id, ...doc.data() } as DbUser;
  }

  const now = new Date().toISOString();
  const newUser = {
    line_user_id: lineUserId,
    nickname: displayName,
    avatar_emoji: "😊",
    birth_year: null,
    area: null,
    industry: null,
    company: null,
    bio: null,
    is_banned: false,
    ban_reason: null,
    is_approved: false,
    invited_by_code: inviteCode || null,
    created_at: now,
    updated_at: now,
  };

  try {
    const docRef = await usersRef.add(newUser);
    return { id: docRef.id, ...newUser } as DbUser;
  } catch (e) {
    console.error("ユーザー作成失敗:", e);
    return null;
  }
}

export async function getUserByLineId(lineUserId: string): Promise<DbUser | null> {
  const snapshot = await adminDb.collection("users").where("line_user_id", "==", lineUserId).limit(1).get();
  if (snapshot.empty) return null;
  const doc = snapshot.docs[0];
  return { id: doc.id, ...doc.data() } as DbUser;
}


export async function authenticateRequest(request: Request): Promise<DbUser | null> {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.slice(7);
  const lineProfile = await verifyLineToken(token);
  if (!lineProfile) return null;

  return getUserByLineId(lineProfile.userId);
}
