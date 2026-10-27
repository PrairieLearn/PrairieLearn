-- BLOCK sync_question_author_uids
WITH
  incoming AS (
    SELECT
      *
    FROM
      jsonb_to_recordset($incoming::jsonb) AS i (question_id bigint, uids jsonb)
  ),
  deleted AS (
    DELETE FROM question_author_uids AS qa USING incoming AS i
    WHERE
      qa.question_id = i.question_id
      AND NOT (i.uids ? qa.uid)
  )
INSERT INTO
  question_author_uids (question_id, uid)
SELECT
  i.question_id,
  u.uid
FROM
  incoming AS i
  CROSS JOIN LATERAL jsonb_array_elements_text(i.uids) AS u (uid)
WHERE
  NOT EXISTS (
    SELECT
      1
    FROM
      question_author_uids AS qa
    WHERE
      qa.question_id = i.question_id
      AND qa.uid = u.uid
  )
ON CONFLICT (question_id, uid) DO NOTHING;
