-- BLOCK select_authors
-- Resolve names using the same course staff roster as the author picker.
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
SELECT
  author.uid,
  coalesce(staff.name, author.uid) AS display_name,
  count(DISTINCT q.id)::int AS question_count
FROM
  questions AS q
  CROSS JOIN LATERAL unnest(q.authors) AS author (uid)
  LEFT JOIN staff ON staff.course_id = q.course_id
  AND staff.uid = author.uid
WHERE
  q.course_id = $course_id
GROUP BY
  author.uid,
  staff.name
ORDER BY
  author.uid;

-- BLOCK select_authored_questions
-- Deleted questions and locally credited adaptations remain part of the report.
SELECT
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
WHERE
  q.course_id = $course_id
  AND $author_uid = ANY (q.authors)
ORDER BY
  q.qid NULLS LAST,
  q.id
LIMIT
  $limit
OFFSET
  $offset;
