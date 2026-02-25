import { supabaseAdmin } from "@/lib/supabase/server";

export async function tryMatch(newRequestId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin.rpc("try_match_atomic", {
    p_request_id: newRequestId,
  });

  if (error) {
    console.error("try_match_atomic エラー:", error);
    return null;
  }

  return data as string | null;
}
