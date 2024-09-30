-- BLOCK sync_question_sharing_sets
WITH
  nqss AS (
    SELECT
      *
    FROM
      jsonb_to_recordset($new_question_sharing_sets::JSONB) AS (question_id bigint, sharing_set_id bigint)
  )
INSERT INTO
  sharing_set_questions (question_id, sharing_set_id)
SELECT
  question_id,
  sharing_set_id
FROM
  nqss
ON CONFLICT (question_id, sharing_set_id) DO NOTHING;
