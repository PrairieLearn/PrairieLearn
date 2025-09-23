-- BLOCK create_instance_group
INSERT INTO
  instance_groups (course_instance_id, name)
VALUES
  ($course_instance_id, $name)
RETURNING
  *;

-- BLOCK select_instance_groups_by_course_instance
SELECT
  *
FROM
  instance_groups
WHERE
  course_instance_id = $course_instance_id
  AND deleted_at IS NULL
ORDER BY
  name;

-- BLOCK select_instance_group_by_id
SELECT
  *
FROM
  instance_groups
WHERE
  id = $id
  AND deleted_at IS NULL;

-- BLOCK update_instance_group_name
UPDATE instance_groups
SET
  name = $name
WHERE
  id = $id
  AND deleted_at IS NULL
RETURNING
  *;

-- BLOCK delete_instance_group
UPDATE instance_groups
SET
  deleted_at = NOW()
WHERE
  id = $id
  AND deleted_at IS NULL
RETURNING
  *;

-- BLOCK add_enrollment_to_instance_group
INSERT INTO
  enrollment_instance_groups (enrollment_id, instance_group_id)
SELECT
  e.id AS enrollment_id,
  ig.id AS instance_group_id
FROM
  enrollments AS e,
  instance_groups AS ig
WHERE
  e.id = $enrollment_id
  AND ig.id = $instance_group_id
  -- Ensure the enrollment is in the same course instance as the instance group
  AND e.course_instance_id = ig.course_instance_id
ON CONFLICT (enrollment_id, instance_group_id) DO NOTHING
RETURNING
  *;

-- BLOCK remove_enrollment_from_instance_group
DELETE FROM enrollment_instance_groups
WHERE
  enrollment_id = $enrollment_id
  AND instance_group_id = $instance_group_id;

-- BLOCK select_enrollments_in_instance_group
SELECT
  e.*
FROM
  enrollments e
  JOIN enrollment_instance_groups eig ON e.id = eig.enrollment_id
WHERE
  eig.instance_group_id = $instance_group_id;

-- BLOCK select_instance_groups_for_enrollment
SELECT
  ig.*
FROM
  instance_groups AS ig
  JOIN enrollment_instance_groups eig ON ig.id = eig.instance_group_id
WHERE
  eig.enrollment_id = $enrollment_id
  AND ig.deleted_at IS NULL
ORDER BY
  ig.name;
