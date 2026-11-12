-- BLOCK select_authored_questions
-- Include deleted questions and locally credited adaptations. The stored
-- author identifier is the grouping key, even when a staff name is available.
SELECT
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
  CROSS JOIN LATERAL (
    SELECT DISTINCT
      uid
    FROM
      unnest(q.authors) AS uid
  ) AS author
  LEFT JOIN (
    SELECT
      cp.course_id,
      u.uid,
      u.name
    FROM
      course_permissions AS cp
      JOIN users AS u ON u.id = cp.user_id
  ) AS staff ON staff.course_id = q.course_id
  AND staff.uid = author.uid
WHERE
  q.course_id = $course_id
ORDER BY
  author.uid,
  q.qid NULLS LAST,
  q.id;
