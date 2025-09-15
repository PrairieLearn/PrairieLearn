ALTER TABLE jobs
ADD COLUMN data JSONB NOT NULL DEFAULT '{}'::JSONB;

ALTER TABLE jobs
ADD CONSTRAINT jobs_data_is_object CHECK (jsonb_typeof(data) = 'object');
