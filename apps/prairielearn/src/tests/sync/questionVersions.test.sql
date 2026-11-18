-- BLOCK select_versions
SELECT
  to_jsonb(qv.*) AS question_version,
  to_jsonb(s.*) AS settings,
  qv.created_at::text AS created_at,
  qv.superseded_at::text AS superseded_at
FROM
  question_versions AS qv
  JOIN questions AS q ON q.id = qv.question_id
  LEFT JOIN question_version_settings AS s ON s.question_version_id = qv.id
WHERE
  q.course_id = $course_id
  AND qv.question_id = $question_id
ORDER BY
  qv.id;
