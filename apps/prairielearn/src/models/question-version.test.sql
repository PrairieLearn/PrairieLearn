-- BLOCK insert_question_revision
WITH
  inserted_chunk AS (
    INSERT INTO
      chunks (
        course_id,
        question_id,
        type,
        uuid,
        created_at,
        superseded_at
      )
    SELECT
      q.course_id,
      q.id,
      'question',
      gen_random_uuid(),
      $created_at::timestamptz,
      $superseded_at::timestamptz
    FROM
      questions AS q
    WHERE
      q.id = $question_id
    RETURNING
      *
  ),
  inserted_settings AS (
    INSERT INTO
      question_versions
    SELECT
      settings.*
    FROM
      inserted_chunk AS c
      JOIN questions AS q ON q.id = c.question_id
      CROSS JOIN LATERAL jsonb_populate_record(
        NULL::question_versions,
        to_jsonb(q.*) || jsonb_build_object(
          'chunk_id',
          c.id,
          'partial_credit',
          $partial_credit::boolean
        )
      ) AS settings
    WHERE
      $with_settings::boolean
  )
SELECT
  *
FROM
  inserted_chunk;

-- BLOCK rename_and_delete_question
UPDATE questions
SET
  qid = 'renamed-question',
  directory = 'renamed-question',
  deleted_at = now()
WHERE
  id = $question_id;
