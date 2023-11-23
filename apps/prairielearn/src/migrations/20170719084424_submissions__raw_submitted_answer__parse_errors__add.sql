ALTER TABLE submissions
ADD COLUMN raw_submitted_answer jsonb;

ALTER TABLE submissions
ADD COLUMN parse_errors jsonb;
