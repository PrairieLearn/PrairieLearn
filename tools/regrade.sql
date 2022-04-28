-- BLOCK select_assessment_question_info
SELECT
  q.qid AS question_qid,
  a.title AS assessment_title
FROM
  assessment_questions AS aq
  JOIN questions AS q ON (q.id = aq.question_id)
  JOIN assessments AS a ON (a.id = aq.assessment_id)
WHERE aq.id = $assessment_question_id;

-- BLOCK reset_grading
UPDATE submissions AS s
SET
  -- TODO: are we missing anything here?
  score = NULL,
  partial_scores = NULL,
  feedback = NULL,
  graded_at = NULL,
  grading_requested_at = NULL,
  correct = NULL,
  gradable = TRUE
FROM
  variants AS v
  JOIN instance_questions AS iq ON (iq.id = v.instance_question_id)
WHERE
  -- TODO: should we filter to only open variants?
  s.variant_id = v.id
  AND iq.assessment_question_id = $assessment_question_id;

-- BLOCK select_next_submission_to_grade
SELECT
  s.id,
  s.grading_requested_at,
  to_jsonb(v.*) AS variant,
  to_jsonb(q.*) AS question,
  to_jsonb(c.*) AS course
FROM
  submissions AS s
  JOIN variants AS v ON (v.id = s.variant_id)
  JOIN instance_questions AS iq ON (iq.id = v.instance_question_id)
  JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
  JOIN questions AS q ON (q.id = aq.question_id)
  JOIN pl_courses AS c ON (c.id = q.course_id)
WHERE
  -- TODO: should we filter to only open variants?
  iq.assessment_question_id = $assessment_question_id
  AND s.graded_at IS NULL
ORDER BY s.id ASC
LIMIT 1;
