-- PersonalPlate profile recommendation fields migration
-- Run this once in the Supabase SQL Editor on an existing database.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS activity_level TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS target_calories INTEGER,
  ADD COLUMN IF NOT EXISTS budget_usd NUMERIC,
  ADD COLUMN IF NOT EXISTS preferred_foods TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS disliked_foods TEXT[] DEFAULT '{}';
