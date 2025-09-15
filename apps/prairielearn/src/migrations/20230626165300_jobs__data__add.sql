ALTER TABLE jobs
ADD COLUMN data JSONB NOT NULL DEFAULT '{}'::JSONB;

ALTER TABLE jobs
-- squawk-ignore constraint-missing-not-valid
ADD CONSTRAINT jobs_data_is_object CHECK (jsonb_typeof(data) = 'object');
