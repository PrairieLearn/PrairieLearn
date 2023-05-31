-- BLOCK course_instance_enrollment_count
SELECT
  COUNT(*)::integer AS count
FROM
  enrollments
WHERE
  course_instance_id = $course_instance_id;

-- BLOCK question_counts
WITH
  external_grading_count AS (
    SELECT
      COUNT(*)::integer AS count
    FROM
      questions
    WHERE
      course_id = $course_id
      AND external_grading_enabled = TRUE
  ),
  workspace_count AS (
    SELECT
      COUNT(*)::integer AS count
    FROM
      questions
    WHERE
      course_id = $course_id
      AND workspace_image IS NOT NULL
  )
SELECT
  wc.count AS workspace_question_count,
  egc.count AS external_grading_question_count
FROM
  external_grading_count AS egc,
  workspace_count AS wc;

-- BLOCK update_course_instance_billing
UPDATE course_instances
SET
  student_billing_enabled = $student_billing_enabled
WHERE
  id = $course_instance_id;
