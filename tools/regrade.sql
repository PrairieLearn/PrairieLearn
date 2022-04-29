-- BLOCK select_assessment_question_info
SELECT
  q.qid AS question_qid,
  a.title AS assessment_title
FROM
  assessment_questions AS aq
  JOIN questions AS q ON (q.id = aq.question_id)
  JOIN assessments AS a ON (a.id = aq.assessment_id)
WHERE aq.id = $assessment_question_id;

-- BLOCK select_assessment_instance_info
SELECT
  u.name,
  u.uid,
  a.title AS assessment_title
FROM
  users AS u
  JOIN assessment_instances AS ai ON (ai.user_id = u.user_id)
  JOIN assessments AS a ON (a.id = ai.assessment_id)
WHERE ai.id = $assessment_instance_id;

-- BLOCK reset_grading
WITH updated_instance_questions AS (
  UPDATE instance_questions AS iq
  SET
    -- TODO: if we ever try to use this for homeworks, we might have to do
    -- something with the `variants_points_list` column.
    open = TRUE,
    points = 0,
    score_perc = 0,
    number_attempts = 0,
    points_list_original = array_fill(iq.points_list_original[1], ARRAY[100]),
    points_list = array_fill(iq.points_list_original[1], ARRAY[100]),
    some_submission = NULL,
    some_perfect_submission = NULL,
    some_nonzero_submission = NULL,
    highest_submission_score = NULL,
    first_submission_score = NULL,
    last_submission_score = NULL,
    max_submission_score = NULL,
    average_submission_score = NULL,
    submission_score_array = NULL,
    incremental_submission_score_array = NULL,
    incremental_submission_points_array = NULL,
    used_for_grade = NULL
  WHERE
    iq.assessment_question_id = $assessment_question_id
    AND ($assessment_instance_id::bigint IS NULL OR iq.assessment_instance_id = $assessment_instance_id)
)
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
  AND iq.assessment_question_id = $assessment_question_id
  AND ($assessment_instance_id::bigint IS NULL OR iq.assessment_instance_id = $assessment_instance_id);

-- BLOCK select_next_submission_to_grade
SELECT
  s.id,
  s.grading_requested_at,
  to_jsonb(s.*) AS submission,
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
  AND ($assessment_instance_id::bigint IS NULL OR iq.assessment_instance_id = $assessment_instance_id)
  AND iq.open
  AND s.graded_at IS NULL
ORDER BY iq.id ASC, s.id ASC
LIMIT 1;
