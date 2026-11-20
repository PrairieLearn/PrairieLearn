-- BLOCK select_versions
SELECT
  to_jsonb(qv.*) AS question_version,
  to_jsonb(s.*) AS settings,
  qv.created_at::text AS created_at,
  qv.superseded_at::text AS superseded_at
FROM
  question_versions AS qv
  LEFT JOIN question_version_settings AS s ON s.question_version_id = qv.id
WHERE
  qv.question_id = $question_id
ORDER BY
  qv.id;
