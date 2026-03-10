-- Migration: 2026-03-11
-- 1. match_group_members に completed_at カラムを追加
-- 2. try_match_atomic RPC のレストラン自動割り当てを廃止（ユーザーがチャットで決定）

-- ==========================================
-- 1. completed_at カラム追加
-- ==========================================
ALTER TABLE match_group_members
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- ==========================================
-- 2. try_match_atomic を更新（レストランを '未定' に）
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
    -- 1人目の候補を検索
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

    -- === マッチ成立！===

    v_gid := uuid_generate_v4();

    -- グループ作成（レストランはユーザーがチャットで決定するため '未定'）
    INSERT INTO match_groups (id, area, date, time, restaurant_id, restaurant_name, status)
    VALUES (v_gid, v_req.area, v_date, '12:00', NULL, '未定', 'confirmed');

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
      v_gid, NULL, 'システム',
      '🎉 マッチング成立！' || COALESCE(v_names, '???') || ' の3人でランチしましょう！チャットでお店を決めてください🍽️',
      TRUE
    );

    -- 通知
    INSERT INTO notifications (target_user_id, title, body, is_global)
    VALUES
      (v_req.user_id, 'マッチング成立！',
        COALESCE(v_names, '???') || ' の3人でランチマッチングが成立しました。チャットでお店を決めましょう！', FALSE),
      (v_c1.user_id, 'マッチング成立！',
        COALESCE(v_names, '???') || ' の3人でランチマッチングが成立しました。チャットでお店を決めましょう！', FALSE),
      (v_c2.user_id, 'マッチング成立！',
        COALESCE(v_names, '???') || ' の3人でランチマッチングが成立しました。チャットでお店を決めましょう！', FALSE);

    RETURN v_gid;
  END LOOP;

  RETURN NULL;
END;
$$;
