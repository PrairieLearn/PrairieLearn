ALTER TABLE course_requests
ALTER COLUMN approved_status
SET NOT NULL;

ALTER TABLE course_requests
ALTER COLUMN short_name
SET NOT NULL;

ALTER TABLE course_requests
ALTER COLUMN title
SET NOT NULL;

ALTER TABLE course_requests
ALTER COLUMN user_id
SET NOT NULL;
