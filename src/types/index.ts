export interface UserProfile {
  id: string;
  nickname: string;
  birthYear: number;
  area: string;
  industry: string;
  company: string;
  bio: string;
  avatarEmoji: string;
  isLoggedIn: boolean;
}

export interface MatchGroup {
  id: string;
  members: MatchMember[];
  date: string;
  time: string;
  area: string;
  restaurant: string;
  status: "pending" | "confirmed" | "completed";
}

export interface MatchMember {
  id: string;
  nickname: string;
  birthYear: number;
  industry: string;
  avatarEmoji: string;
  bio: string;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  timestamp: string;
  isSystem?: boolean;
}

export interface Review {
  targetId: string;
  targetName: string;
  communication: number;
  punctuality: number;
  meetAgain: number;
  comment: string;
}

export type AreaOption = "umeda" | "yodoyabashi" | "honmachi" | "namba" | "tennoji";

// --- DB Types ---

export interface DbUser {
  id: string;
  line_user_id: string;
  nickname: string | null;
  birth_year: number | null;
  area: AreaOption | null;
  industry: string | null;
  company: string | null;
  bio: string | null;
  avatar_emoji: string | null;
  is_banned: boolean;
  ban_reason: string | null;
  is_approved: boolean;
  invited_by_code: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbMatchRequest {
  id: string;
  user_id: string;
  area: AreaOption;
  available_dates: string[];
  status: "waiting" | "matched" | "expired" | "cancelled";
  matched_group_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbMatchGroup {
  id: string;
  area: AreaOption;
  date: string;
  time: string;
  restaurant_id: string | null;
  restaurant_name: string;
  status: "pending" | "confirmed" | "completed" | "cancelled";
  created_at: string;
  updated_at: string;
}

export interface DbMatchGroupMember {
  id: string;
  group_id: string;
  user_id: string;
  joined_at: string;
}

export interface DbMessage {
  id: string;
  group_id: string;
  sender_id: string | null;
  sender_name: string;
  text: string;
  is_system: boolean;
  created_at: string;
}

export interface DbReview {
  id: string;
  group_id: string;
  reviewer_id: string;
  target_id: string;
  communication: number;
  punctuality: number;
  meet_again: number;
  comment: string | null;
  created_at: string;
}

export interface DbInviteCode {
  id: string;
  code: string;
  generated_by: string | null;
  group_id: string | null;
  used_by: string | null;
  used_at: string | null;
  is_active: boolean;
  created_at: string;
}

export interface DbBlacklist {
  id: string;
  user_id: string;
  blocked_user_id: string;
  created_at: string;
}

export interface DbNotification {
  id: string;
  target_user_id: string | null;
  title: string;
  body: string;
  is_global: boolean;
  created_at: string;
}

export interface DbRestaurant {
  id: string;
  name: string;
  area: AreaOption;
  address: string | null;
  description: string | null;
  created_at: string;
}
