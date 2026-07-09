-- PersonalPlate fridge_items migration
-- Run this once in the Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS fridge_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE fridge_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own fridge items" ON fridge_items;
DROP POLICY IF EXISTS "Users can insert own fridge items" ON fridge_items;
DROP POLICY IF EXISTS "Users can update own fridge items" ON fridge_items;
DROP POLICY IF EXISTS "Users can delete own fridge items" ON fridge_items;

CREATE POLICY "Users can view own fridge items"
  ON fridge_items FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own fridge items"
  ON fridge_items FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own fridge items"
  ON fridge_items FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own fridge items"
  ON fridge_items FOR DELETE
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_fridge_items_user_id ON fridge_items(user_id);
CREATE INDEX IF NOT EXISTS idx_fridge_items_created_at ON fridge_items(created_at DESC);
