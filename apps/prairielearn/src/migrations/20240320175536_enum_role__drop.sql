DELETE FROM assessment_access_rules
WHERE
  role > 'Student';

DELETE FROM course_instance_access_rules
WHERE
  role > 'Student';

ALTER TABLE assessment_access_rules
DROP COLUMN IF EXISTS role;

ALTER TABLE course_instance_access_rules
DROP COLUMN IF EXISTS role;

ALTER TABLE enrollments
DROP COLUMN IF EXISTS role;

ALTER TABLE access_logs
DROP COLUMN IF EXISTS auth_role;

ALTER TABLE access_logs
DROP COLUMN IF EXISTS user_role;

DROP TYPE enum_role CASCADE;
