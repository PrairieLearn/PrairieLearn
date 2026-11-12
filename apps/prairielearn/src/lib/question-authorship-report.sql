-- BLOCK select_authored_questions
-- Include deleted questions and locally credited adaptations. The stored
-- author identifier is the grouping key, even when a staff name is available.
WITH
  staff AS (
    SELECT
      cp.course_id,
      u.uid,
      u.name
    FROM
      course_permissions AS cp
      JOIN users AS u ON u.id = cp.user_id
  )
SELECT DISTINCT
  author.uid AS author_uid,
  coalesce(staff.name, author.uid) AS display_name,
  q.id,
  q.qid,
  q.title,
  q.deleted_at,
  q.draft,
  CASE
    WHEN q.copied_from_question_id IS NOT NULL THEN 'resolved'
    WHEN q.copied_from IS NOT NULL THEN 'unresolved'
    ELSE 'absent'
  END AS provenance_status
FROM
  questions AS q
  CROSS JOIN LATERAL unnest(q.authors) AS author (uid)
  LEFT JOIN staff ON staff.course_id = q.course_id
  AND staff.uid = author.uid
WHERE
  q.course_id = $course_id
ORDER BY
  author.uid,
  q.qid NULLS LAST,
  q.id;
