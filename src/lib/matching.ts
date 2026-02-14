import { supabaseAdmin } from "@/lib/supabase/server";
import { v4 as uuidv4 } from "uuid";

export async function tryMatch(newRequestId: string): Promise<string | null> {
  // Get the new request
  const { data: newReq } = await supabaseAdmin
    .from("match_requests")
    .select("*")
    .eq("id", newRequestId)
    .single();

  if (!newReq || newReq.status !== "waiting") return null;

  // Find other waiting requests in the same area
  const { data: candidates } = await supabaseAdmin
    .from("match_requests")
    .select("*")
    .eq("area", newReq.area)
    .eq("status", "waiting")
    .neq("id", newRequestId)
    .neq("user_id", newReq.user_id);

  if (!candidates || candidates.length < 2) return null;

  // Get blocked user pairs for the requesting user
  const { data: blocks } = await supabaseAdmin
    .from("blacklist")
    .select("blocked_user_id")
    .eq("user_id", newReq.user_id);

  const blockedIds = new Set((blocks || []).map((b) => b.blocked_user_id));

  // Filter candidates: not blocked, and have overlapping dates
  const validCandidates = candidates.filter((c) => {
    if (blockedIds.has(c.user_id)) return false;
    const overlap = (c.available_dates as string[]).filter((d: string) =>
      (newReq.available_dates as string[]).includes(d)
    );
    return overlap.length > 0;
  });

  if (validCandidates.length < 2) return null;

  // Find best date: most candidates available, earliest
  const dateCount: Record<string, string[]> = {};
  for (const d of newReq.available_dates as string[]) {
    const available = validCandidates.filter((c) =>
      (c.available_dates as string[]).includes(d)
    );
    if (available.length >= 2) {
      dateCount[d] = available.map((c) => c.id);
    }
  }

  const sortedDates = Object.entries(dateCount).sort((a, b) => {
    if (b[1].length !== a[1].length) return b[1].length - a[1].length;
    return a[0].localeCompare(b[0]);
  });

  if (sortedDates.length === 0) return null;

  const [matchDate, matchCandidateIds] = sortedDates[0];

  // Pick 2 candidates (first 2 from the available list)
  const selectedRequestIds = matchCandidateIds.slice(0, 2);
  const selectedRequests = validCandidates.filter((c) =>
    selectedRequestIds.includes(c.id)
  );

  // Get a random restaurant for the area
  const { data: restaurants } = await supabaseAdmin
    .from("restaurants")
    .select("*")
    .eq("area", newReq.area);

  const restaurant = restaurants && restaurants.length > 0
    ? restaurants[Math.floor(Math.random() * restaurants.length)]
    : { id: null, name: "未定" };

  // Create match group
  const groupId = uuidv4();
  const { error: groupError } = await supabaseAdmin.from("match_groups").insert({
    id: groupId,
    area: newReq.area,
    date: matchDate,
    time: "12:00",
    restaurant_id: restaurant.id,
    restaurant_name: restaurant.name,
    status: "confirmed",
  });

  if (groupError) {
    console.error("Failed to create match group:", groupError);
    return null;
  }

  // All 3 user IDs
  const allUserIds = [
    newReq.user_id,
    ...selectedRequests.map((r) => r.user_id),
  ];

  // Insert group members
  await supabaseAdmin.from("match_group_members").insert(
    allUserIds.map((userId) => ({
      group_id: groupId,
      user_id: userId,
    }))
  );

  // Update all 3 match requests to matched
  const allRequestIds = [newRequestId, ...selectedRequestIds];
  await supabaseAdmin
    .from("match_requests")
    .update({ status: "matched", matched_group_id: groupId })
    .in("id", allRequestIds);

  // Get user profiles for system message
  const { data: users } = await supabaseAdmin
    .from("users")
    .select("nickname")
    .in("id", allUserIds);

  const names = (users || []).map((u) => u.nickname || "???").join("、");

  // Insert system message
  await supabaseAdmin.from("messages").insert({
    group_id: groupId,
    sender_id: null,
    sender_name: "システム",
    text: `🎉 マッチング成立！${names} の3人でランチしましょう！`,
    is_system: true,
  });

  // Create notifications for all members
  await supabaseAdmin.from("notifications").insert(
    allUserIds.map((userId) => ({
      target_user_id: userId,
      title: "マッチング成立！",
      body: `${names} の3人でランチマッチングが成立しました。チャットで詳細を確認しましょう！`,
      is_global: false,
    }))
  );

  return groupId;
}
