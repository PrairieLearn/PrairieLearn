ALTER TABLE pl_courses
ALTER COLUMN institution_id
SET DEFAULT 1;

ALTER TABLE pl_courses
ALTER COLUMN institution_id
SET NOT NULL;
