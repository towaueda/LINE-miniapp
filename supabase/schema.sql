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
  birth_year INTEGER,
  area TEXT CHECK (area IN ('umeda', 'yodoyabashi', 'honmachi', 'namba', 'tennoji')),
  industry TEXT,
  company TEXT,
  bio TEXT,
  avatar_emoji TEXT DEFAULT '😊',
  is_banned BOOLEAN DEFAULT FALSE,
  ban_reason TEXT,
  is_approved BOOLEAN DEFAULT FALSE,
  invited_by_code TEXT,
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
  area TEXT NOT NULL CHECK (area IN ('umeda', 'yodoyabashi', 'honmachi', 'namba', 'tennoji')),
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
  area TEXT NOT NULL CHECK (area IN ('umeda', 'yodoyabashi', 'honmachi', 'namba', 'tennoji')),
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

-- Seed: Default Invite Codes (for testing)
INSERT INTO invite_codes (code) VALUES
  ('TRI-WELCOME'),
  ('TRI-TESTCODE'),
  ('TRI-2026');

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
  area TEXT NOT NULL CHECK (area IN ('umeda', 'yodoyabashi', 'honmachi', 'namba', 'tennoji')),
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
  ('本町ガーデンシティ', 'honmachi', 'オフィス街のおしゃれランチ'),
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

-- ==========================================
-- カラム制約（本番強化）
-- ==========================================
ALTER TABLE messages ADD CONSTRAINT chk_messages_text_length CHECK (char_length(text) <= 2000);
ALTER TABLE users ADD CONSTRAINT chk_users_nickname_length CHECK (nickname IS NULL OR char_length(nickname) <= 20);
ALTER TABLE users ADD CONSTRAINT chk_users_bio_length CHECK (bio IS NULL OR char_length(bio) <= 200);
ALTER TABLE users ADD CONSTRAINT chk_users_company_length CHECK (company IS NULL OR char_length(company) <= 50);
ALTER TABLE reviews ADD CONSTRAINT chk_reviews_comment_length CHECK (comment IS NULL OR char_length(comment) <= 500);

-- ==========================================
-- 追加インデックス（本番強化）
-- ==========================================
-- ブラックリスト: 双方向検索用
CREATE INDEX idx_blacklist_user_id ON blacklist(user_id);
CREATE INDEX idx_blacklist_blocked_user_id ON blacklist(blocked_user_id);

-- マッチリクエスト: 待機中リクエスト用部分インデックス
CREATE INDEX idx_match_requests_waiting
  ON match_requests(area, created_at)
  WHERE status = 'waiting';

-- ==========================================
-- expire_old_match_requests()
-- 全available_datesが過去のリクエストを期限切れに更新
-- ==========================================
CREATE OR REPLACE FUNCTION expire_old_match_requests()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE match_requests
  SET status = 'expired'
  WHERE status = 'waiting'
    AND NOT EXISTS (
      SELECT 1 FROM unnest(available_dates) AS d
      WHERE d >= CURRENT_DATE
    );
END;
$$;

-- ==========================================
-- try_match_atomic(p_request_id UUID)
-- 競合状態を防止するアトミック3人マッチング
-- 成功時はgroup_idを返し、失敗時はNULLを返す
-- ==========================================
CREATE OR REPLACE FUNCTION try_match_atomic(p_request_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_req   RECORD;
  v_c1    RECORD;
  v_c2    RECORD;
  v_date  DATE;
  v_gid   UUID;
  v_rest  RECORD;
  v_names TEXT;
BEGIN
  -- トリガーとなるリクエストをロック
  SELECT * INTO v_req
  FROM match_requests
  WHERE id = p_request_id AND status = 'waiting'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- リクエスターの検証: 承認済み、BAN無し、プロフィール完成
  IF NOT EXISTS (
    SELECT 1 FROM users
    WHERE id = v_req.user_id
      AND is_approved = TRUE
      AND is_banned = FALSE
      AND nickname IS NOT NULL
      AND area IS NOT NULL
  ) THEN
    RETURN NULL;
  END IF;

  -- 未来の日付を順に探索（早い順）
  FOR v_date IN
    SELECT d::date
    FROM unnest(v_req.available_dates) AS d
    WHERE d::date >= CURRENT_DATE
    ORDER BY d::date
  LOOP
    -- 1人目の候補を検索（SKIP LOCKEDで競合状態を防止）
    SELECT mr.* INTO v_c1
    FROM match_requests mr
    JOIN users u ON u.id = mr.user_id
    WHERE mr.status = 'waiting'
      AND mr.area = v_req.area
      AND mr.id != v_req.id
      AND mr.user_id != v_req.user_id
      AND v_date = ANY(mr.available_dates)
      AND u.is_approved = TRUE
      AND u.is_banned = FALSE
      AND u.nickname IS NOT NULL
      AND u.area IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM blacklist
        WHERE (user_id = v_req.user_id AND blocked_user_id = mr.user_id)
           OR (user_id = mr.user_id AND blocked_user_id = v_req.user_id)
      )
    ORDER BY mr.created_at
    FOR UPDATE OF mr SKIP LOCKED
    LIMIT 1;

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    -- 2人目の候補を検索（3方向ブラックリストチェック）
    SELECT mr.* INTO v_c2
    FROM match_requests mr
    JOIN users u ON u.id = mr.user_id
    WHERE mr.status = 'waiting'
      AND mr.area = v_req.area
      AND mr.id != v_req.id
      AND mr.id != v_c1.id
      AND mr.user_id != v_req.user_id
      AND mr.user_id != v_c1.user_id
      AND v_date = ANY(mr.available_dates)
      AND u.is_approved = TRUE
      AND u.is_banned = FALSE
      AND u.nickname IS NOT NULL
      AND u.area IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM blacklist
        WHERE (user_id = v_req.user_id AND blocked_user_id = mr.user_id)
           OR (user_id = mr.user_id AND blocked_user_id = v_req.user_id)
           OR (user_id = v_c1.user_id AND blocked_user_id = mr.user_id)
           OR (user_id = mr.user_id AND blocked_user_id = v_c1.user_id)
      )
    ORDER BY mr.created_at
    FOR UPDATE OF mr SKIP LOCKED
    LIMIT 1;

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    -- === マッチ成立！単一トランザクション内でグループ作成 ===

    -- エリアのレストランをランダム選択
    SELECT * INTO v_rest
    FROM restaurants
    WHERE area = v_req.area
    ORDER BY random()
    LIMIT 1;

    v_gid := uuid_generate_v4();

    -- グループ作成
    INSERT INTO match_groups (id, area, date, time, restaurant_id, restaurant_name, status)
    VALUES (
      v_gid,
      v_req.area,
      v_date,
      '12:00',
      v_rest.id,
      COALESCE(v_rest.name, '未定'),
      'confirmed'
    );

    -- メンバー追加
    INSERT INTO match_group_members (group_id, user_id) VALUES
      (v_gid, v_req.user_id),
      (v_gid, v_c1.user_id),
      (v_gid, v_c2.user_id);

    -- 3件のリクエストをマッチ済みに更新
    UPDATE match_requests
    SET status = 'matched', matched_group_id = v_gid
    WHERE id IN (v_req.id, v_c1.id, v_c2.id);

    -- 名前文字列を生成
    SELECT string_agg(nickname, '、') INTO v_names
    FROM users
    WHERE id IN (v_req.user_id, v_c1.user_id, v_c2.user_id);

    -- システムメッセージ
    INSERT INTO messages (group_id, sender_id, sender_name, text, is_system)
    VALUES (
      v_gid,
      NULL,
      'システム',
      '🎉 マッチング成立！' || COALESCE(v_names, '???') || ' の3人でランチしましょう！',
      TRUE
    );

    -- 通知
    INSERT INTO notifications (target_user_id, title, body, is_global)
    VALUES
      (v_req.user_id, 'マッチング成立！',
        COALESCE(v_names, '???') || ' の3人でランチマッチングが成立しました。チャットで詳細を確認しましょう！', FALSE),
      (v_c1.user_id, 'マッチング成立！',
        COALESCE(v_names, '???') || ' の3人でランチマッチングが成立しました。チャットで詳細を確認しましょう！', FALSE),
      (v_c2.user_id, 'マッチング成立！',
        COALESCE(v_names, '???') || ' の3人でランチマッチングが成立しました。チャットで詳細を確認しましょう！', FALSE);

    RETURN v_gid;
  END LOOP;

  -- マッチなし
  RETURN NULL;
END;
$$;

-- ==========================================
-- Review Averages (DB aggregation for admin stats)
-- ==========================================
CREATE OR REPLACE FUNCTION review_averages()
RETURNS TABLE(avg_communication NUMERIC, avg_punctuality NUMERIC, avg_meet_again NUMERIC)
LANGUAGE sql STABLE
AS $$
  SELECT
    ROUND(AVG(communication)::numeric, 1),
    ROUND(AVG(punctuality)::numeric, 1),
    ROUND(AVG(meet_again)::numeric, 1)
  FROM reviews;
$$;
