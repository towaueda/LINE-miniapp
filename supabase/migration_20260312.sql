-- ============================================================
-- Migration: 2026-03-12
-- Two-person matching support
-- ============================================================

-- Update status constraint
ALTER TABLE match_requests DROP CONSTRAINT IF EXISTS match_requests_status_check;
ALTER TABLE match_requests ADD CONSTRAINT match_requests_status_check
  CHECK (status IN ('waiting', 'matched', 'expired', 'cancelled', 'no_match', 'two_person_offered'));

-- New columns
ALTER TABLE match_requests
  ADD COLUMN IF NOT EXISTS two_person_offered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS two_person_response TEXT CHECK (two_person_response IN ('accepted', 'declined')),
  ADD COLUMN IF NOT EXISTS two_person_partner_id UUID REFERENCES match_requests(id) ON DELETE SET NULL;

-- ============================================================
-- Function: offer_two_person_matches()
-- Find pairs of waiting requests eligible for 2-person offer.
-- Returns count of pairs processed.
-- ============================================================
CREATE OR REPLACE FUNCTION offer_two_person_matches()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_req       match_requests%ROWTYPE;
  v_partner   match_requests%ROWTYPE;
  v_processed UUID[] := ARRAY[]::UUID[];
  v_count     INTEGER := 0;
BEGIN
  LOOP
    -- Find the oldest eligible request not yet processed
    SELECT mr.* INTO v_req
    FROM match_requests mr
    WHERE mr.status = 'waiting'
      AND mr.created_at <= NOW() - INTERVAL '24 hours'
      AND NOT (mr.id = ANY(v_processed))
    ORDER BY mr.created_at ASC
    LIMIT 1;

    EXIT WHEN NOT FOUND;

    -- Find a partner: same area, overlapping future date, waiting 24h+, no blacklist
    SELECT mr2.* INTO v_partner
    FROM match_requests mr2
    WHERE mr2.id != v_req.id
      AND mr2.status = 'waiting'
      AND mr2.area = v_req.area
      AND mr2.created_at <= NOW() - INTERVAL '24 hours'
      AND NOT (mr2.id = ANY(v_processed))
      -- Overlapping future date
      AND EXISTS (
        SELECT 1
        FROM unnest(mr2.available_dates) d2
        WHERE d2::date >= CURRENT_DATE
          AND EXISTS (
            SELECT 1 FROM unnest(v_req.available_dates) d1 WHERE d1::date = d2::date
          )
      )
      -- No blacklist between them
      AND NOT EXISTS (
        SELECT 1 FROM blacklist bl
        WHERE (bl.user_id = v_req.user_id AND bl.blocked_user_id = mr2.user_id)
           OR (bl.user_id = mr2.user_id AND bl.blocked_user_id = v_req.user_id)
      )
    ORDER BY mr2.created_at ASC
    LIMIT 1;

    IF NOT FOUND THEN
      -- No partner found; mark as processed to skip on next iteration
      v_processed := array_append(v_processed, v_req.id);
      CONTINUE;
    END IF;

    -- Offer both requests
    UPDATE match_requests
    SET status = 'two_person_offered',
        two_person_offered_at = NOW(),
        two_person_partner_id = v_partner.id
    WHERE id = v_req.id;

    UPDATE match_requests
    SET status = 'two_person_offered',
        two_person_offered_at = NOW(),
        two_person_partner_id = v_req.id
    WHERE id = v_partner.id;

    -- Insert notifications for both users
    INSERT INTO notifications (target_user_id, title, body, is_global)
    VALUES
      (v_req.user_id,     '2人でランチしませんか？', '3人揃わなかったため、2人でのランチを提案しています。マッチングページで返答してください。', FALSE),
      (v_partner.user_id, '2人でランチしませんか？', '3人揃わなかったため、2人でのランチを提案しています。マッチングページで返答してください。', FALSE);

    v_processed := array_append(v_processed, v_req.id);
    v_processed := array_append(v_processed, v_partner.id);
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

-- ============================================================
-- Function: confirm_two_person_match(p_request_id UUID)
-- Returns group_id UUID if both parties have accepted, else NULL.
-- ============================================================
CREATE OR REPLACE FUNCTION confirm_two_person_match(p_request_id UUID)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_req         match_requests%ROWTYPE;
  v_partner     match_requests%ROWTYPE;
  v_group_id    UUID;
  v_date        DATE;
  v_names       TEXT;
  v_user_name   TEXT;
  v_partner_name TEXT;
BEGIN
  -- Lock and verify the request
  SELECT * INTO v_req
  FROM match_requests
  WHERE id = p_request_id
    AND status = 'two_person_offered'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Verify user is approved and not banned
  IF NOT EXISTS (
    SELECT 1 FROM users
    WHERE id = v_req.user_id
      AND is_approved = TRUE
      AND (is_banned IS NULL OR is_banned = FALSE)
  ) THEN
    RETURN NULL;
  END IF;

  -- Set response to accepted
  UPDATE match_requests
  SET two_person_response = 'accepted'
  WHERE id = p_request_id;

  -- Get partner request
  IF v_req.two_person_partner_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_partner
  FROM match_requests
  WHERE id = v_req.two_person_partner_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- If partner hasn't accepted yet, return NULL
  IF v_partner.two_person_response IS DISTINCT FROM 'accepted' THEN
    RETURN NULL;
  END IF;

  -- Find first overlapping date >= CURRENT_DATE
  SELECT d1::date INTO v_date
  FROM unnest(v_req.available_dates) d1
  WHERE d1::date >= CURRENT_DATE
    AND EXISTS (
      SELECT 1 FROM unnest(v_partner.available_dates) d2 WHERE d2::date = d1::date
    )
  ORDER BY d1::date ASC
  LIMIT 1;

  -- Create 2-person match group
  INSERT INTO match_groups (area, date, time, restaurant_name, status)
  VALUES (v_req.area, v_date, '12:00', '未定', 'confirmed')
  RETURNING id INTO v_group_id;

  -- Insert 2 members
  INSERT INTO match_group_members (group_id, user_id)
  VALUES (v_group_id, v_req.user_id), (v_group_id, v_partner.user_id);

  -- Update both requests to matched
  UPDATE match_requests
  SET status = 'matched'
  WHERE id IN (v_req.id, v_partner.id);

  -- Build names string for system message
  SELECT nickname INTO v_user_name FROM users WHERE id = v_req.user_id;
  SELECT nickname INTO v_partner_name FROM users WHERE id = v_partner.user_id;
  v_names := COALESCE(v_user_name, '不明') || 'さんと' || COALESCE(v_partner_name, '不明') || 'さん';

  -- Insert system message
  INSERT INTO messages (group_id, sender_id, sender_name, text, is_system)
  VALUES (
    v_group_id,
    NULL,
    'システム',
    '🎉 2人でのランチマッチング成立！' || v_names || 'の2人でランチしましょう！チャットでお店を決めてください🍽️',
    TRUE
  );

  -- Insert notifications to both
  INSERT INTO notifications (target_user_id, title, body, is_global)
  VALUES
    (v_req.user_id,     'マッチング成立！', '2人でのランチマッチングが成立しました。チャットでお店を決めましょう！', FALSE),
    (v_partner.user_id, 'マッチング成立！', '2人でのランチマッチングが成立しました。チャットでお店を決めましょう！', FALSE);

  RETURN v_group_id;
END;
$$;

-- ============================================================
-- Function: decline_two_person_match(p_request_id UUID)
-- Returns VOID. Sets both parties to no_match.
-- ============================================================
CREATE OR REPLACE FUNCTION decline_two_person_match(p_request_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_req        match_requests%ROWTYPE;
  v_partner    match_requests%ROWTYPE;
BEGIN
  SELECT * INTO v_req
  FROM match_requests
  WHERE id = p_request_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Set this request to no_match with declined response
  UPDATE match_requests
  SET status = 'no_match',
      two_person_response = 'declined'
  WHERE id = p_request_id;

  -- Set partner to no_match if exists and not already resolved
  IF v_req.two_person_partner_id IS NOT NULL THEN
    SELECT * INTO v_partner
    FROM match_requests
    WHERE id = v_req.two_person_partner_id;

    IF FOUND AND v_partner.status NOT IN ('no_match', 'matched') THEN
      UPDATE match_requests
      SET status = 'no_match'
      WHERE id = v_partner.id;
    END IF;
  END IF;

  -- Insert notifications to both
  INSERT INTO notifications (target_user_id, title, body, is_global)
  VALUES (v_req.user_id, 'マッチングなし', '2人マッチングが成立しませんでした。別の日程を選んでお試しください。', FALSE);

  IF v_req.two_person_partner_id IS NOT NULL AND v_partner.user_id IS NOT NULL THEN
    INSERT INTO notifications (target_user_id, title, body, is_global)
    VALUES (v_partner.user_id, 'マッチングなし', '2人マッチングが成立しませんでした。別の日程を選んでお試しください。', FALSE);
  END IF;
END;
$$;

-- ============================================================
-- Function: expire_no_match_requests()
-- Daily cron. Returns total count of expired requests.
-- ============================================================
CREATE OR REPLACE FUNCTION expire_no_match_requests()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_user_ids  UUID[];
  v_user_ids2 UUID[];
  v_total     INTEGER := 0;
BEGIN
  -- Case 1: Single person waiting, last available date is tomorrow
  WITH u AS (
    UPDATE match_requests SET status = 'no_match'
    WHERE status = 'waiting'
      AND NOT EXISTS (SELECT 1 FROM unnest(available_dates) d WHERE d::date > CURRENT_DATE + 1)
      AND EXISTS (SELECT 1 FROM unnest(available_dates) d WHERE d::date = CURRENT_DATE + 1)
      AND NOT EXISTS (
        SELECT 1 FROM match_requests mr2
        WHERE mr2.id != match_requests.id
          AND mr2.area = match_requests.area
          AND mr2.status IN ('waiting', 'two_person_offered')
          AND EXISTS (SELECT 1 FROM unnest(mr2.available_dates) d2 WHERE d2::date = CURRENT_DATE + 1)
      )
    RETURNING user_id
  )
  SELECT array_agg(user_id) INTO v_user_ids FROM u;

  IF v_user_ids IS NOT NULL THEN
    INSERT INTO notifications (target_user_id, title, body, is_global)
    SELECT uid, 'マッチングなし', '残念ながらマッチングが成立しませんでした。別の日程を選んでお試しください。', FALSE
    FROM unnest(v_user_ids) AS uid;

    v_total := v_total + array_length(v_user_ids, 1);
  END IF;

  -- Case 2: two_person_offered, deadline passed (all dates <= tomorrow)
  WITH u AS (
    UPDATE match_requests SET status = 'no_match'
    WHERE status = 'two_person_offered'
      AND NOT EXISTS (SELECT 1 FROM unnest(available_dates) d WHERE d::date > CURRENT_DATE + 1)
    RETURNING user_id
  )
  SELECT array_agg(user_id) INTO v_user_ids2 FROM u;

  IF v_user_ids2 IS NOT NULL THEN
    INSERT INTO notifications (target_user_id, title, body, is_global)
    SELECT uid, 'マッチングなし', '期限内にマッチングが成立しませんでした。別の日程を選んでお試しください。', FALSE
    FROM unnest(v_user_ids2) AS uid;

    v_total := v_total + array_length(v_user_ids2, 1);
  END IF;

  RETURN v_total;
END;
$$;
