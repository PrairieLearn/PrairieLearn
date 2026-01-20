-- BLOCK create_student_group
INSERT INTO
  student_groups (course_instance_id, name, color)
VALUES
  ($course_instance_id, $name, $color)
RETURNING
  *;

-- BLOCK select_student_groups_by_course_instance
SELECT
  *
FROM
  student_groups
WHERE
  course_instance_id = $course_instance_id
  AND deleted_at IS NULL
ORDER BY
  name;

-- BLOCK select_student_group_by_id
SELECT
  *
FROM
  student_groups
WHERE
  id = $id
  AND deleted_at IS NULL;

-- BLOCK update_student_group_name
UPDATE student_groups
SET
  name = $name
WHERE
  id = $id
  AND deleted_at IS NULL
RETURNING
  *;

-- BLOCK update_student_group
UPDATE student_groups
SET
  name = $name,
  color = $color
WHERE
  id = $id
  AND deleted_at IS NULL
RETURNING
  *;

-- BLOCK delete_student_group
UPDATE student_groups
SET
  deleted_at = NOW()
WHERE
  id = $id
  AND deleted_at IS NULL
RETURNING
  *;

-- BLOCK add_enrollment_to_student_group
INSERT INTO
  student_group_enrollments (enrollment_id, student_group_id)
SELECT
  e.id AS enrollment_id,
  sg.id AS student_group_id
FROM
  enrollments AS e,
  student_groups AS sg
WHERE
  e.id = $enrollment_id
  AND sg.id = $student_group_id
  -- Ensure the enrollment is in the same course instance as the student group
  AND e.course_instance_id = sg.course_instance_id
ON CONFLICT (enrollment_id, student_group_id) DO NOTHING
RETURNING
  *;

-- BLOCK remove_enrollment_from_student_group
DELETE FROM student_group_enrollments
WHERE
  enrollment_id = $enrollment_id
  AND student_group_id = $student_group_id;

-- BLOCK select_enrollments_in_student_group
SELECT
  e.*
FROM
  enrollments e
  JOIN student_group_enrollments sge ON e.id = sge.enrollment_id
WHERE
  sge.student_group_id = $student_group_id;

-- BLOCK select_student_groups_for_enrollment
SELECT
  sg.*
FROM
  student_groups AS sg
  JOIN student_group_enrollments sge ON sg.id = sge.student_group_id
WHERE
  sge.enrollment_id = $enrollment_id
  AND sg.deleted_at IS NULL
ORDER BY
  sg.name;

-- BLOCK select_enrollment_ids_for_student_group
SELECT
  sge.enrollment_id
FROM
  student_group_enrollments AS sge
WHERE
  sge.student_group_id = $student_group_id;

-- BLOCK bulk_remove_enrollments_from_student_group
DELETE FROM student_group_enrollments
WHERE
  student_group_id = $student_group_id
  AND enrollment_id = ANY ($enrollment_ids::bigint[]);
