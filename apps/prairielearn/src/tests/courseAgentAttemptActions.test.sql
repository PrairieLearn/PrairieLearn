-- BLOCK select_assessment_instance
SELECT
  ai.open,
  ai.date_limit,
  ai.score_perc,
  ai.points
FROM
  assessment_instances AS ai
WHERE
  ai.id = $assessment_instance_id;

-- BLOCK select_instance_questions
SELECT
  iq.id,
  q.qid,
  iq.points,
  aq.max_points,
  iq.requires_manual_grading,
  grader.uid AS assigned_grader_uid
FROM
  instance_questions AS iq
  JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
  JOIN questions AS q ON (q.id = aq.question_id)
  LEFT JOIN users AS grader ON (grader.id = iq.assigned_grader)
WHERE
  iq.assessment_instance_id = $assessment_instance_id
ORDER BY
  iq.id;

-- BLOCK give_manual_points
WITH
  updated_question AS (
    UPDATE assessment_questions AS aq
    SET
      max_manual_points = 2
    FROM
      instance_questions AS iq
    WHERE
      iq.id = $instance_question_id
      AND aq.id = iq.assessment_question_id
  )
  -- The attempt never answered it, and AI grading only grades answered questions.
UPDATE instance_questions
SET
  requires_manual_grading = TRUE,
  status = 'saved'
WHERE
  id = $instance_question_id;

-- BLOCK set_ai_grading_credits
UPDATE course_instances
SET
  credit_transferable_milli_dollars = $milli_dollars
WHERE
  id = 1;
