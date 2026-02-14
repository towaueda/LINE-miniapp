import { supabaseAdmin } from "@/lib/supabase/server";
import { DbUser } from "@/types";

export async function verifyLineToken(accessToken: string): Promise<{ userId: string; displayName: string } | null> {
  try {
    const res = await fetch("https://api.line.me/v2/profile", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const profile = await res.json();
    return { userId: profile.userId, displayName: profile.displayName };
  } catch {
    return null;
  }
}

export async function getOrCreateUser(lineUserId: string, displayName: string): Promise<DbUser | null> {
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
    })
    .select()
    .single();

  if (error) {
    console.error("Failed to create user:", error);
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

  // First try: token is a LINE access token
  const lineProfile = await verifyLineToken(token);
  if (!lineProfile) return null;

  return getUserByLineId(lineProfile.userId);
}
