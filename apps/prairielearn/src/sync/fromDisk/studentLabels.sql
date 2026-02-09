-- BLOCK select_student_labels
SELECT
  *
FROM
  student_labels
WHERE
  course_instance_id = $course_instance_id
ORDER BY
  name ASC;

-- BLOCK insert_student_labels
INSERT INTO
  student_labels (course_instance_id, name, color)
SELECT
  $course_instance_id,
  (t ->> 0)::text,
  (t ->> 1)::text
FROM
  UNNEST($student_labels::jsonb[]) AS t
RETURNING
  *;

-- BLOCK update_student_labels
WITH
  updates AS (
    SELECT
      (t ->> 0)::text AS name,
      (t ->> 1)::text AS color
    FROM
      UNNEST($student_labels::jsonb[]) AS t
  )
UPDATE student_labels AS sl
SET
  color = updates.color
FROM
  updates
WHERE
  sl.course_instance_id = $course_instance_id
  AND sl.name = updates.name;

-- BLOCK delete_student_labels
DELETE FROM student_labels
WHERE
  course_instance_id = $course_instance_id
  AND name = ANY ($student_labels::text[]);

-- BLOCK select_enrollments_for_labels_to_delete
-- Returns student_label_enrollments joined with enrollment user_id and label name
-- for labels that are about to be deleted (for audit logging)
SELECT
  sle.id AS student_label_enrollment_id,
  sle.enrollment_id,
  sle.student_label_id,
  e.user_id,
  sl.name AS label_name
FROM
  student_label_enrollments sle
  JOIN student_labels sl ON sle.student_label_id = sl.id
  JOIN enrollments e ON sle.enrollment_id = e.id
WHERE
  sl.course_instance_id = $course_instance_id
  AND sl.name = ANY ($student_labels::text[]);
