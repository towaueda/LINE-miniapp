-- Triangle App - Database Schema
-- Run this in Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==========================================
-- 1. Users
-- ==========================================
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  line_user_id TEXT UNIQUE NOT NULL,
  nickname TEXT,
  age_group TEXT CHECK (age_group IN ('24-26', '27-28', '29-30')),
  area TEXT CHECK (area IN ('umeda', 'yodoyabashi', 'namba', 'tennoji')),
  job TEXT,
  bio TEXT,
  avatar_emoji TEXT DEFAULT '😊',
  is_banned BOOLEAN DEFAULT FALSE,
  ban_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_users_line_user_id ON users(line_user_id);

-- ==========================================
-- 2. Match Requests
-- ==========================================
CREATE TABLE match_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  area TEXT NOT NULL CHECK (area IN ('umeda', 'yodoyabashi', 'namba', 'tennoji')),
  available_dates DATE[] NOT NULL,
  status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'matched', 'expired', 'cancelled')),
  matched_group_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_match_requests_status ON match_requests(status);
CREATE INDEX idx_match_requests_user_id ON match_requests(user_id);

-- ==========================================
-- 3. Match Groups
-- ==========================================
CREATE TABLE match_groups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  area TEXT NOT NULL CHECK (area IN ('umeda', 'yodoyabashi', 'namba', 'tennoji')),
  date DATE NOT NULL,
  time TEXT NOT NULL DEFAULT '12:00',
  restaurant_id UUID,
  restaurant_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'completed', 'cancelled')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add FK from match_requests to match_groups
ALTER TABLE match_requests
  ADD CONSTRAINT fk_match_requests_group
  FOREIGN KEY (matched_group_id) REFERENCES match_groups(id);

-- ==========================================
-- 4. Match Group Members
-- ==========================================
CREATE TABLE match_group_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id UUID NOT NULL REFERENCES match_groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(group_id, user_id)
);

CREATE INDEX idx_match_group_members_group ON match_group_members(group_id);
CREATE INDEX idx_match_group_members_user ON match_group_members(user_id);

-- ==========================================
-- 5. Messages
-- ==========================================
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id UUID NOT NULL REFERENCES match_groups(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES users(id) ON DELETE SET NULL,
  sender_name TEXT NOT NULL,
  text TEXT NOT NULL,
  is_system BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_messages_group_id ON messages(group_id);
CREATE INDEX idx_messages_created_at ON messages(created_at);

-- ==========================================
-- 6. Reviews
-- ==========================================
CREATE TABLE reviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id UUID NOT NULL REFERENCES match_groups(id) ON DELETE CASCADE,
  reviewer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  communication INTEGER NOT NULL CHECK (communication BETWEEN 1 AND 5),
  punctuality INTEGER NOT NULL CHECK (punctuality BETWEEN 1 AND 5),
  meet_again INTEGER NOT NULL CHECK (meet_again BETWEEN 1 AND 5),
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(group_id, reviewer_id, target_id)
);

CREATE INDEX idx_reviews_group_id ON reviews(group_id);
CREATE INDEX idx_reviews_target_id ON reviews(target_id);

-- ==========================================
-- 7. Invite Codes
-- ==========================================
CREATE TABLE invite_codes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT UNIQUE NOT NULL,
  generated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  group_id UUID REFERENCES match_groups(id) ON DELETE SET NULL,
  used_by UUID REFERENCES users(id) ON DELETE SET NULL,
  used_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_invite_codes_code ON invite_codes(code);

-- ==========================================
-- 8. Blacklist
-- ==========================================
CREATE TABLE blacklist (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, blocked_user_id)
);

-- ==========================================
-- 9. Notifications
-- ==========================================
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  target_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  is_global BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notifications_target ON notifications(target_user_id);
CREATE INDEX idx_notifications_global ON notifications(is_global);

-- ==========================================
-- 10. Restaurants
-- ==========================================
CREATE TABLE restaurants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  area TEXT NOT NULL CHECK (area IN ('umeda', 'yodoyabashi', 'namba', 'tennoji')),
  address TEXT,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_restaurants_area ON restaurants(area);

-- ==========================================
-- Seed: Default Restaurants
-- ==========================================
INSERT INTO restaurants (name, area, description) VALUES
  ('GARB MONAQUE', 'umeda', 'おしゃれなカフェダイニング'),
  ('北浜レトロ', 'yodoyabashi', 'レトロな雰囲気のカフェ'),
  ('道頓堀クラフトビア醸造所', 'namba', 'クラフトビールとランチ'),
  ('てんしば イーナ', 'tennoji', '天王寺公園内のカフェ');

-- ==========================================
-- Enable Realtime for messages table
-- ==========================================
ALTER PUBLICATION supabase_realtime ADD TABLE messages;

-- ==========================================
-- Auto-update updated_at trigger
-- ==========================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER tr_match_requests_updated_at
  BEFORE UPDATE ON match_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER tr_match_groups_updated_at
  BEFORE UPDATE ON match_groups
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
