-- PersonalPlate profile recommendation fields migration
-- Run once in the Supabase SQL Editor on an EXISTING database (idempotent).
--
-- Fixes production error on /profile Save:
--   "Could not find the 'activity_level' column of 'profiles' in the schema cache"
--
-- After running:
--   1. Wait a few seconds (PostgREST schema cache refresh), OR
--      Dashboard → Project Settings → API → Reload schema
--   2. Retry Save on https://…/profile
--
-- Fresh installs that already ran supabase-schema.sql do NOT need this file
-- (those columns are already in CREATE TABLE profiles).

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS nutrition_goals TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS preferred_cuisine TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS activity_level TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS target_calories INTEGER,
  ADD COLUMN IF NOT EXISTS budget_usd NUMERIC,
  ADD COLUMN IF NOT EXISTS preferred_foods TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS disliked_foods TEXT[] DEFAULT '{}';
