ALTER TABLE assessments
ADD COLUMN IF NOT EXISTS auto_close boolean DEFAULT true;
