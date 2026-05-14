-- BLOCK select_ai_grading_rubrics_assessment_question_id
-- testCourse seeds an "aiGradingRubrics" question attached to the
-- hw10-aiGrading homework in the Sp15 course instance — purpose-built for
-- AI grading tests, so we pin to it instead of picking an arbitrary row.
SELECT
  aq.id
FROM
  assessment_questions AS aq
  JOIN questions AS q ON (q.id = aq.question_id)
WHERE
  q.qid = 'aiGradingRubrics'
LIMIT
  1;

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
