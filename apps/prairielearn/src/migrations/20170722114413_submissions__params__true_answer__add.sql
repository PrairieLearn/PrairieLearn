ALTER TABLE submissions
ADD COLUMN params jsonb;

ALTER TABLE submissions
ADD COLUMN true_answer jsonb;
