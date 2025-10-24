-- BLOCK select_info_for_instance_question_grade
SELECT
  to_json(a) AS assessment,
  to_json(aq) AS assessment_question,
  to_json(iq) AS instance_question
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
      points_list = $points_list,
      variants_points_list = $variants_points_list,
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

-- BLOCK recalculate_instance_question_stats
WITH
  first_calculation AS (
    SELECT
      count(s.id) > 0 AS some_submission_var,
      coalesce(bool_or(s.score = 1), FALSE) AS some_perfect_submission_var,
      coalesce(bool_or(s.score != 0), FALSE) AS some_nonzero_submission_var,
      array_agg(
        s.score
        ORDER BY
          s.date
      ) AS submission_score_array_var,
      array_agg(
        s.score
        ORDER BY
          s.date
      ) FILTER (
        WHERE
          s.score IS NOT NULL
      ) AS submission_non_null_score_array_var,
      max(s.score) AS max_submission_score_var,
      avg(s.score) AS average_submission_score_var
    FROM
      variants AS v
      JOIN submissions AS s ON (s.variant_id = v.id)
    WHERE
      v.instance_question_id = $instance_question_id
      AND s.gradable IS TRUE
  ),
  second_calculation AS (
    SELECT
      array_increments_above_max (submission_score_array_var) AS incremental_submission_score_array_var
    FROM
      first_calculation
  )
UPDATE instance_questions AS iq
SET
  some_submission = some_submission_var,
  some_perfect_submission = some_perfect_submission_var,
  some_nonzero_submission = some_nonzero_submission_var,
  first_submission_score = submission_non_null_score_array_var[1],
  last_submission_score = submission_non_null_score_array_var[
    array_length(submission_non_null_score_array_var, 1)
  ],
  max_submission_score = max_submission_score_var,
  average_submission_score = average_submission_score_var,
  submission_score_array = submission_score_array_var,
  incremental_submission_score_array = incremental_submission_score_array_var,
  incremental_submission_points_array = scores_to_points_array (
    incremental_submission_score_array_var,
    iq.points_list_original
  )
FROM
  first_calculation,
  second_calculation
WHERE
  iq.id = $instance_question_id;
