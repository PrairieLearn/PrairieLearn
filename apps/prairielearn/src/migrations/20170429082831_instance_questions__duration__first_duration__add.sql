ALTER TABLE instance_questions
ADD COLUMN IF NOT EXISTS duration INTERVAL DEFAULT INTERVAL '0 seconds';

ALTER TABLE instance_questions
ADD COLUMN IF NOT EXISTS first_duration INTERVAL;
