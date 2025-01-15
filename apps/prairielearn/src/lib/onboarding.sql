-- BLOCK select_course_has_staff
SELECT
  EXISTS (
    SELECT
      1
    FROM
      course_permissions AS cp
    WHERE
      cp.course_id = $course_id
    OFFSET
      1
  );

-- BLOCK select_course_has_questions
SELECT
  EXISTS (
    SELECT
      1
    FROM
      questions as q
    WHERE
      q.course_id = $course_id
      AND q.deleted_at IS NULL
  );

-- BLOCK select_course_has_assessments
SELECT
  EXISTS (
    SELECT
      1
    FROM
      assessments AS a
      LEFT JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
    WHERE
      ci.course_id = $course_id
      AND a.deleted_at IS NULL
  )
