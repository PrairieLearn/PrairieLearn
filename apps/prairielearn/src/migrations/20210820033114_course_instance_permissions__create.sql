CREATE TYPE enum_course_instance_role AS ENUM(
  'None',
  'Student Data Viewer',
  'Student Data Editor'
);

CREATE TABLE course_instance_permissions (
  id BIGSERIAL PRIMARY KEY,
  course_instance_id BIGINT NOT NULL REFERENCES course_instances ON DELETE CASCADE ON UPDATE CASCADE,
  course_instance_role enum_course_instance_role,
  course_permission_id BIGINT NOT NULL REFERENCES course_permissions ON DELETE CASCADE ON UPDATE CASCADE,
  UNIQUE (course_permission_id, course_instance_id)
);

-- Give course_permissions with course_role of at least 'None' to all users with
-- enrollments of role Instructor.
INSERT INTO
  course_permissions (user_id, course_id, course_role)
SELECT
  e.user_id,
  ci.course_id,
  'None' AS course_role
FROM
  enrollments AS e
  JOIN course_instances AS ci ON (ci.id = e.course_instance_id)
  AND (ci.deleted_at IS NULL)
  JOIN pl_courses AS c ON (c.id = ci.course_id)
  AND (c.deleted_at IS NULL)
  AND (NOT c.example_course)
WHERE
  e.role >= 'Instructor'
GROUP BY
  e.user_id,
  ci.course_id
ON CONFLICT DO NOTHING;

-- Give course_instance_permissions with course_instance_role 'Student Data Editor'
-- to all users with enrollments of role Instructor.
INSERT INTO
  course_instance_permissions (
    course_instance_id,
    course_instance_role,
    course_permission_id
  )
SELECT
  e.course_instance_id,
  'Student Data Editor'::enum_course_instance_role AS course_instance_role,
  cp.id AS course_permission_id
FROM
  enrollments AS e
  JOIN course_instances AS ci ON (ci.id = e.course_instance_id)
  AND (ci.deleted_at IS NULL)
  JOIN pl_courses AS c ON (c.id = ci.course_id)
  AND (c.deleted_at IS NULL)
  AND (NOT c.example_course)
  JOIN course_permissions AS cp ON (cp.user_id = e.user_id)
  AND (cp.course_id = c.id)
WHERE
  e.role >= 'Instructor'
ON CONFLICT DO NOTHING;
