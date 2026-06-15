ALTER TABLE courses
ADD CONSTRAINT courses_branch_not_null CHECK (branch IS NOT NULL) NOT VALID;
