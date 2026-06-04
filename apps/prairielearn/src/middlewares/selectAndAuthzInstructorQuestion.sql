-- BLOCK select_and_auth
WITH
  course AS (
    SELECT
      id
    FROM
      courses AS c
    WHERE
      c.id = $course_id
  ),
  issue_count AS (
    SELECT
      count(*) AS open_issue_count
    FROM
      issues AS i
      JOIN course ON i.course_id = course.id
    WHERE
      i.question_id = $question_id
      AND i.course_caused
      AND i.open
  ),
  sharing_info AS (
    SELECT
      count(*) > 0 AS shared_with_course
    FROM
      sharing_sets AS ss
      JOIN sharing_set_questions AS ssq ON ssq.sharing_set_id = ss.id
      JOIN sharing_set_courses AS ssc ON ssc.sharing_set_id = ss.id
      JOIN course ON ssc.course_id = course.id
    WHERE
      ssq.question_id = $question_id
  )
SELECT
  to_jsonb(q) AS question,
  to_jsonb(top) AS topic,
  issue_count.open_issue_count
FROM
  questions AS q
  JOIN topics AS top ON (top.id = q.topic_id),
  issue_count,
  sharing_info
WHERE
  q.id = $question_id
  AND (
    q.course_id = $course_id
    OR q.share_publicly
    OR sharing_info.shared_with_course
  )
  AND q.deleted_at IS NULL;

-- BLOCK select_and_auth_with_course_instance
WITH
  course AS (
    SELECT
      course_id AS id
    FROM
      course_instances AS ci
    WHERE
      ci.id = $course_instance_id
  ),
  issue_count AS (
    SELECT
      count(*) AS open_issue_count
    FROM
      issues AS i
      JOIN course ON i.course_id = course.id
    WHERE
      i.question_id = $question_id
      AND i.course_caused
      AND i.open
  ),
  sharing_info AS (
    SELECT
      count(*) > 0 AS shared_with_course
    FROM
      sharing_sets AS ss
      JOIN sharing_set_questions AS ssq ON ssq.sharing_set_id = ss.id
      JOIN sharing_set_courses AS ssc ON ssc.sharing_set_id = ss.id
      JOIN course ON ssc.course_id = course.id
    WHERE
      ssq.question_id = $question_id
  )
SELECT
  to_jsonb(q) AS question,
  to_jsonb(top) AS topic,
  issue_count.open_issue_count
FROM
  questions AS q
  JOIN topics AS top ON (top.id = q.topic_id),
  course_instances AS ci,
  issue_count,
  sharing_info
WHERE
  q.id = $question_id
  AND ci.id = $course_instance_id
  AND (
    q.course_id = ci.course_id
    OR q.share_publicly
    OR sharing_info.shared_with_course
  )
  AND q.deleted_at IS NULL;
