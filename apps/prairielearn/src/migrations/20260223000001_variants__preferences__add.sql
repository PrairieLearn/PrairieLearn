ALTER TABLE variants
ADD COLUMN IF NOT EXISTS preferences jsonb;
