-- PrairieLearn tests do not run PrairieTest migrations; production shares the schema.
ALTER TABLE pt_courses
ADD COLUMN IF NOT EXISTS end_date timestamptz;
