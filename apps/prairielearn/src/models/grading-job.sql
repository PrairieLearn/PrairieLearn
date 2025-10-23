-- BLOCK select_grading_job
SELECT
  *
FROM
  grading_jobs
WHERE
  id = $grading_job_id;

-- BLOCK insert_grading_job
WITH
  grading_job_data AS (
    SELECT
      s.credit,
      v.id AS variant_id,
      -- This method is only called for manual grading questions if
      -- auto_points > 0, in that case it is treated as internal.
      CASE
        WHEN q.grading_method = 'Manual' THEN 'Internal'
        ELSE q.grading_method
      END AS grading_method,
      iq.assessment_instance_id
    FROM
      submissions AS s
      JOIN variants AS v ON (v.id = s.variant_id)
      JOIN questions AS q ON (q.id = v.question_id)
      LEFT JOIN instance_questions AS iq ON (iq.id = v.instance_question_id)
    WHERE
      s.id = $submission_id
  ),
  updated_submission AS (
    UPDATE submissions AS s
    SET
      grading_requested_at = now(),
      modified_at = now()
    FROM
      grading_job_data AS gjd
    WHERE
      s.id = $submission_id
  ),
  new_grading_job AS (
    INSERT INTO
      grading_jobs AS gj (
        submission_id,
        auth_user_id,
        grading_method,
        grading_requested_at,
        grading_received_at,
        grading_started_at
      )
    SELECT
      $submission_id,
      $authn_user_id,
      gjd.grading_method,
      now(),
      -- For internal grading jobs, we can just use the same timestamp for
      -- all of these. When we're grading externally, these will
      -- be set when the grading job is actually "processed".
      CASE
        WHEN gjd.grading_method = 'Internal' THEN now()
        ELSE NULL
      END,
      CASE
        WHEN gjd.grading_method = 'Internal' THEN now()
        ELSE NULL
      END
    FROM
      grading_job_data AS gjd
    RETURNING
      gj.*
  ),
  updated_instance_question AS (
    -- If the variant is associated with an instance question, update its
    -- status. This is a no-op for instructor and public variants.
    UPDATE instance_questions AS iq
    SET
      status = 'grading',
      modified_at = now()
    FROM
      new_grading_job AS gj
      JOIN submissions AS s ON (s.id = gj.submission_id)
      JOIN variants AS v ON (v.id = s.variant_id)
    WHERE
      iq.id = v.instance_question_id
  )
SELECT
  gj.*,
  gjd.assessment_instance_id,
  gjd.credit
FROM
  new_grading_job AS gj
  JOIN grading_job_data AS gjd ON TRUE;

-- BLOCK select_variant_for_grading_job_update
SELECT
  s.credit,
  v.id AS variant_id,
  iq.id AS instance_question_id,
  iq.open AS instance_question_open,
  ai.id AS assessment_instance_id,
  EXISTS (
    SELECT
      1
    FROM
      variants AS vnew
      JOIN submissions AS snew ON (snew.variant_id = vnew.id)
    WHERE
      vnew.instance_question_id = iq.id
      AND s.id != snew.id
      AND snew.date > s.date
  ) AS has_newer_submission
FROM
  submissions AS s
  JOIN variants AS v ON (v.id = s.variant_id)
  LEFT JOIN instance_questions AS iq ON (iq.id = v.instance_question_id)
  LEFT JOIN assessment_instances AS ai ON (ai.id = iq.assessment_instance_id)
WHERE
  s.id = $submission_id;

-- BLOCK update_grading_job_after_grading
WITH
  updated_submission AS (
    UPDATE submissions
    SET
      graded_at = now(),
      modified_at = now(),
      gradable = $gradable,
      broken = $broken,
      params = COALESCE($params::jsonb, params),
      true_answer = COALESCE($true_answer::jsonb, true_answer),
      format_errors = $format_errors::jsonb,
      partial_scores = $partial_scores::jsonb,
      score = $score,
      v2_score = $v2_score,
      correct = $correct,
      feedback = $feedback::jsonb,
      submitted_answer = COALESCE($submitted_answer::jsonb, submitted_answer)
    WHERE
      id = $submission_id
    RETURNING
      *
  ),
  updated_variant AS (
    UPDATE variants AS v
    SET
      params = COALESCE($params::jsonb, v.params),
      true_answer = COALESCE($true_answer::jsonb, v.true_answer),
      modified_at = now()
    FROM
      updated_submission AS s
    WHERE
      v.id = s.variant_id
    RETURNING
      v.*
  ),
  updated_instance_question_status AS (
    UPDATE instance_questions AS iq
    SET
      status = 'invalid'::enum_instance_question_status
    FROM
      updated_variant AS v
    WHERE
      iq.id = v.instance_question_id
      -- This is only updated here if the question is not gradable, if it's
      -- gradable it is updated in a separate step
      AND NOT $gradable
  )
UPDATE grading_jobs
SET
  graded_at = now(),
  -- For internally-graded questions, these three timestamps will be NULL
  -- in params. For the first two, we'll reuse the existing
  -- values that were set in `insertGradingJob`, and for the finish
  -- timestamp, we'll use the current time.
  grading_received_at = COALESCE($received_time, grading_received_at),
  grading_started_at = COALESCE($start_time, grading_started_at),
  grading_finished_at = COALESCE($finish_time, now()),
  gradable = $gradable,
  score = $score,
  -- manual_points and auto_points are not updated for internal/external grading jobs
  correct = $correct,
  feedback = $feedback
WHERE
  id = $grading_job_id
RETURNING
  *;

-- BLOCK select_type_and_points_for_instance_question
SELECT
  a.type AS assessment_type,
  iq.manual_points,
  aq.max_points
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
