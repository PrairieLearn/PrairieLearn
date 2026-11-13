-- BLOCK select_question_version_at_date
SELECT
  to_jsonb(c.*) AS chunk,
  to_jsonb(qv.*) AS question_version
FROM
  chunks AS c
  -- Keep incomplete revisions visible so callers cannot silently fall back to other settings.
  LEFT JOIN question_versions AS qv ON qv.chunk_id = c.id
WHERE
  c.question_id = $question_id
  AND c.type = 'question'
  AND (
    c.created_at IS NULL
    OR c.created_at <= $at_date::timestamptz
  )
  AND (
    c.superseded_at IS NULL
    OR c.superseded_at > $at_date::timestamptz
  );
