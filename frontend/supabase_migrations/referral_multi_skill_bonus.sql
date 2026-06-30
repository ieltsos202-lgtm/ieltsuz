-- Updates the referral reward: the promo-code OWNER (referrer) now receives
-- +1 attempt for EACH skill (listening, reading, speaking, writing) and +1 mock
-- test, instead of just +1 bonus mock test. The friend who applies the code is
-- unchanged (keeps standard trial limits).
--
-- Safe to run multiple times. Run this in the Supabase SQL editor.
CREATE OR REPLACE FUNCTION public.apply_referral(new_user_id UUID, promo TEXT)
RETURNS JSON AS $$
DECLARE
  referrer_record RECORD;
  already_referred TEXT;
BEGIN
  promo := TRIM(promo);

  SELECT id, bonus_mock_remaining INTO referrer_record
  FROM public.profiles
  WHERE promo_code = promo;

  IF referrer_record IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Invalid promo code');
  END IF;

  IF referrer_record.id = new_user_id THEN
    RETURN json_build_object('success', false, 'error', 'You cannot use your own promo code');
  END IF;

  SELECT referred_by INTO already_referred
  FROM public.profiles
  WHERE id = new_user_id;

  IF already_referred IS NOT NULL THEN
    RETURN json_build_object('success', false, 'error', 'You have already used a referral code');
  END IF;

  -- Reward the referrer (promo code owner) with +1 attempt for every skill
  -- plus +1 mock test.
  UPDATE public.profiles
  SET trial_listening_remaining = COALESCE(trial_listening_remaining, 0) + 1,
      trial_reading_remaining   = COALESCE(trial_reading_remaining, 0) + 1,
      trial_speaking_remaining  = COALESCE(trial_speaking_remaining, 0) + 1,
      trial_writing_remaining   = COALESCE(trial_writing_remaining, 0) + 1,
      bonus_mock_remaining      = COALESCE(bonus_mock_remaining, 0) + 1
  WHERE id = referrer_record.id;

  UPDATE public.profiles
  SET referred_by = promo
  WHERE id = new_user_id;

  INSERT INTO public.notifications (user_id, title, message, type)
  VALUES (
    referrer_record.id,
    '🎉 Referral Bonus Earned!',
    'A friend used your promo code. You earned +1 Listening, Reading, Speaking, Writing and Mock test attempt!',
    'referral'
  );

  RETURN json_build_object(
    'success', true,
    'bonus_mock_granted', 1,
    'bonus_listening_granted', 1,
    'bonus_reading_granted', 1,
    'bonus_speaking_granted', 1,
    'bonus_writing_granted', 1
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
