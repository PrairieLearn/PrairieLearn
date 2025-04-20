ALTER TABLE grader_loads
ADD COLUMN lifecycle_state TEXT;

ALTER TABLE grader_loads
ADD COLUMN healthy BOOLEAN;

ALTER TABLE grader_loads
ADD COLUMN config JSONB;

ALTER TABLE grader_loads
ADD COLUMN started_at TIMESTAMPTZ;
