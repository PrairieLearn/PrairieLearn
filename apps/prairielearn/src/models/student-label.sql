-- BLOCK create_student_label
INSERT INTO
  student_labels (course_instance_id, name, color)
VALUES
  ($course_instance_id, $name, $color)
RETURNING
  *;

-- BLOCK select_student_labels_by_course_instance
SELECT
  *
FROM
  student_labels
WHERE
  course_instance_id = $course_instance_id
  AND deleted_at IS NULL
ORDER BY
  name;

-- BLOCK select_student_label_by_id
SELECT
  *
FROM
  student_labels
WHERE
  id = $id
  AND deleted_at IS NULL;


-- BLOCK delete_student_label
UPDATE student_labels
SET
  deleted_at = NOW()
WHERE
  id = $id
  AND deleted_at IS NULL
RETURNING
  *;

-- BLOCK add_enrollment_to_student_label
INSERT INTO
  student_label_enrollments (enrollment_id, student_label_id)
SELECT
  e.id AS enrollment_id,
  sl.id AS student_label_id
FROM
  enrollments AS e,
  student_labels AS sl
WHERE
  e.id = $enrollment_id
  AND sl.id = $student_label_id
  -- Ensure the enrollment is in the same course instance as the student label
  AND e.course_instance_id = sl.course_instance_id
ON CONFLICT (enrollment_id, student_label_id) DO NOTHING
RETURNING
  *;

-- BLOCK remove_enrollment_from_student_label
DELETE FROM student_label_enrollments
WHERE
  enrollment_id = $enrollment_id
  AND student_label_id = $student_label_id;

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
  AND sl.deleted_at IS NULL
ORDER BY
  sl.name;

-- BLOCK select_enrollment_ids_for_student_label
SELECT
  sle.enrollment_id
FROM
  student_label_enrollments AS sle
WHERE
  sle.student_label_id = $student_label_id;

-- BLOCK batch_add_enrollments_to_student_label
INSERT INTO
  student_label_enrollments (enrollment_id, student_label_id)
SELECT
  e.id AS enrollment_id,
  sl.id AS student_label_id
FROM
  unnest($enrollment_ids::bigint[]) AS input_id
  JOIN enrollments AS e ON e.id = input_id
  JOIN student_labels AS sl ON sl.id = $student_label_id
WHERE
  e.course_instance_id = sl.course_instance_id
ON CONFLICT (enrollment_id, student_label_id) DO NOTHING
RETURNING
  *;

-- BLOCK batch_remove_enrollments_from_student_label_with_count
WITH
  deleted AS (
    DELETE FROM student_label_enrollments
    WHERE
      student_label_id = $student_label_id
      AND enrollment_id = ANY ($enrollment_ids::bigint[])
    RETURNING
      *
  )
SELECT
  count(*)::int AS count
FROM
  deleted;
