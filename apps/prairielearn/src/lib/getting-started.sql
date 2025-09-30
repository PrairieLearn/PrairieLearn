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
      -- Offset by 1 to check for at least 2 staff members, since the course creator is added by default
      1
  );

-- BLOCK select_course_has_questions
SELECT
  EXISTS (
    SELECT
      1
    FROM
      questions AS q
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
      INNER JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
    WHERE
      a.deleted_at IS NULL
      AND ci.course_id = $course_id
      AND ci.deleted_at IS NULL
  );

-- BLOCK select_first_course_instance
SELECT
  *
FROM
  course_instances
WHERE
  course_id = $course_id
  AND deleted_at IS NULL
LIMIT
  1;
