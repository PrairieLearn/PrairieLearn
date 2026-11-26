-- BLOCK select_versions
SELECT
  to_jsonb(qv.*) AS question_version,
  to_jsonb(s.*) AS settings,
  qv.created_at::text AS created_at,
  (qv.created_at - interval '1 microsecond')::text AS before_date,
  qv.superseded_at::text AS superseded_at
FROM
  question_versions AS qv
  LEFT JOIN question_version_settings AS s ON s.question_version_id = qv.id
WHERE
  qv.question_id = $question_id
ORDER BY
  qv.id;

-- BLOCK delete_settings
DELETE FROM question_version_settings
WHERE
  question_version_id = $question_version_id;
