-- BLOCK create_student_label
INSERT INTO
  student_labels (course_instance_id, name, color, uuid)
VALUES
  ($course_instance_id, $name, $color, $uuid)
RETURNING
  *;

-- BLOCK select_student_labels_by_course_instance
SELECT
  *
FROM
  student_labels
WHERE
  course_instance_id = $course_instance_id
ORDER BY
  name;

-- BLOCK select_student_label_by_id
SELECT
  *
FROM
  student_labels
WHERE
  id = $id;

-- BLOCK delete_student_label
DELETE FROM student_labels
WHERE
  id = $id
RETURNING
  *;

-- BLOCK select_enrollments_in_student_label
SELECT
  e.*
FROM
  enrollments e
  JOIN student_label_enrollments sle ON e.id = sle.enrollment_id
WHERE
  sle.student_label_id = $student_label_id;

-- BLOCK select_student_labels_for_enrollment
SELECT
  sl.*
FROM
  student_labels AS sl
  JOIN student_label_enrollments sle ON sl.id = sle.student_label_id
WHERE
  sle.enrollment_id = $enrollment_id
ORDER BY
  sl.name;

-- BLOCK add_label_to_enrollments
INSERT INTO
  student_label_enrollments (enrollment_id, student_label_id)
SELECT
  unnest($enrollment_ids::bigint[]),
  $student_label_id
ON CONFLICT (enrollment_id, student_label_id) DO NOTHING
RETURNING
  *;

-- BLOCK remove_label_from_enrollments
DELETE FROM student_label_enrollments
WHERE
  student_label_id = $student_label_id
  AND enrollment_id = ANY ($enrollment_ids::bigint[])
RETURNING
  *;

-- BLOCK update_student_label
UPDATE student_labels
SET
  name = $name,
  color = $color
WHERE
  id = $id
RETURNING
  *;

-- BLOCK select_student_label_enrollments_for_label
SELECT
  *
FROM
  student_label_enrollments
WHERE
  student_label_id = $student_label_id;
