-- BLOCK select_info_for_instance_question_grade
SELECT
  to_jsonb(a) AS assessment,
  to_jsonb(aq) AS assessment_question,
  to_jsonb(iq) AS instance_question
FROM
  instance_questions AS iq
  JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
  JOIN assessments AS a ON (a.id = aq.assessment_id)
WHERE
  iq.id = $instance_question_id;

-- BLOCK update_instance_question_grade
WITH
  updated_instance_question AS (
    UPDATE instance_questions AS iq
    SET
      open = $open,
      status = $status,
      auto_points = $auto_points,
      points = $points,
      score_perc = $score_perc,
      highest_submission_score = $highest_submission_score,
      current_value = $current_value,
      points_list = $points_list::double precision[],
      variants_points_list = $variants_points_list::double precision[],
      number_attempts = iq.number_attempts + 1
    WHERE
      iq.id = $instance_question_id
  )
INSERT INTO
  question_score_logs (
    instance_question_id,
    auth_user_id,
    max_points,
    max_auto_points,
    points,
    auto_points,
    score_perc,
    grading_job_id
  )
VALUES
  (
    $instance_question_id,
    $authn_user_id,
    $max_points,
    $max_auto_points,
    $points,
    $auto_points,
    $score_perc,
    $grading_job_id
  );

-- BLOCK select_submissions_for_stats
SELECT
  s.score
FROM
  variants AS v
  JOIN submissions AS s ON (s.variant_id = v.id)
WHERE
  v.instance_question_id = $instance_question_id
  AND s.gradable IS TRUE
  AND s.graded_at IS NOT NULL -- Only consider submissions that have been graded
  AND s.score IS NOT NULL -- Only consider submissions that have an autograded score
ORDER BY
  s.date;

-- BLOCK update_instance_question_stats
UPDATE instance_questions AS iq
SET
  some_submission = $some_submission,
  some_perfect_submission = $some_perfect_submission,
  some_nonzero_submission = $some_nonzero_submission,
  first_submission_score = $first_submission_score,
  last_submission_score = $last_submission_score,
  max_submission_score = $max_submission_score,
  average_submission_score = $average_submission_score,
  submission_score_array = $submission_score_array::double precision[],
  incremental_submission_score_array = $incremental_submission_score_array::double precision[],
  incremental_submission_points_array = $incremental_submission_points_array::double precision[]
WHERE
  iq.id = $instance_question_id;
