-- BLOCK select_assessment_question_by_id
SELECT
  *
FROM
  assessment_questions
WHERE
  id = $id;

-- BLOCK select_assessment_question_by_question_id
SELECT
  *
FROM
  assessment_questions
WHERE
  assessment_id = $assessment_id
  AND question_id = $question_id;

-- BLOCK select_preferences_for_instance_question
SELECT
  aq.preferences
FROM
  instance_questions AS iq
  JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
WHERE
  iq.id = $instance_question_id;

-- BLOCK has_stale_imported_assessment_questions
SELECT
  EXISTS (
    SELECT
      1
    FROM
      JSONB_TO_RECORDSET($expected_questions::jsonb) AS expected (
        assessment_id bigint,
        question_id bigint,
        number integer,
        has_split_points boolean
      )
    WHERE
      NOT EXISTS (
        SELECT
          1
        FROM
          assessment_questions AS aq
          JOIN questions AS q ON q.id = aq.question_id
        WHERE
          aq.assessment_id = expected.assessment_id
          AND aq.question_id = expected.question_id
          AND aq.number = expected.number
          AND aq.deleted_at IS NULL
          AND q.deleted_at IS NULL
          -- With implicit points, sync_assessments assigns the entire total to
          -- manual grading for Manual questions and to auto grading otherwise.
          AND (
            expected.has_split_points
            OR (
              aq.max_manual_points = CASE
                WHEN q.grading_method = 'Manual' THEN aq.max_points
                ELSE 0
              END
              AND aq.max_auto_points = CASE
                WHEN q.grading_method = 'Manual' THEN 0
                ELSE aq.max_points
              END
            )
          )
      )
  );
