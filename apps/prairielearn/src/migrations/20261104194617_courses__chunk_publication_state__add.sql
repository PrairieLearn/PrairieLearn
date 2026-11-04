ALTER TABLE courses
ADD COLUMN chunks_history_started_at timestamptz,
ADD COLUMN chunks_published_at timestamptz;
