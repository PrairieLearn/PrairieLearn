ALTER TABLE questions
ADD COLUMN IF NOT EXISTS cross_origin_isolated boolean DEFAULT false;
