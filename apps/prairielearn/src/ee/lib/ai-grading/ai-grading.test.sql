-- BLOCK insert_test_ai_grading_job_sequence
INSERT INTO
  job_sequences (
    number,
    type,
    description,
    legacy,
    status,
    assessment_question_id
  )
VALUES
  (
    1,
    $type,
    'test',
    FALSE,
    $status::enum_job_status,
    $assessment_question_id
  )
RETURNING
  id;

-- BLOCK select_status
SELECT
  status::text
FROM
  job_sequences
WHERE
  id = $job_sequence_id;

-- BLOCK delete_test_ai_grading_sequences
DELETE FROM job_sequences
WHERE
  assessment_question_id = $assessment_question_id
  AND type = 'ai_grading';
