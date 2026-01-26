ALTER TABLE courses VALIDATE CONSTRAINT courses_branch_not_null;

ALTER TABLE courses
ALTER COLUMN branch
SET NOT NULL;

ALTER TABLE courses
DROP CONSTRAINT courses_branch_not_null;
