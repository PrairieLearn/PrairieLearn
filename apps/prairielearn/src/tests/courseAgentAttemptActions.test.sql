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
