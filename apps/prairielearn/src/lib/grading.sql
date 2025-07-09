-- BLOCK select_assessment_for_submission
SELECT
  ai.id AS assessment_instance_id
FROM
  submissions AS s
  JOIN variants AS v ON (v.id = s.variant_id)
  LEFT JOIN instance_questions AS iq ON (iq.id = v.instance_question_id)
  LEFT JOIN assessment_instances AS ai ON (ai.id = iq.assessment_instance_id)
WHERE
  s.id = $submission_id;

-- BLOCK select_workspace_id
SELECT
  w.id AS workspace_id
FROM
  variants AS v
  JOIN workspaces AS w ON (v.workspace_id = w.id)
WHERE
  v.id = $variant_id;

-- BLOCK select_variant_data
SELECT
  v.instance_question_id,
  q.grading_method,
  aq.max_auto_points,
  aq.max_manual_points
FROM
  variants AS v
  JOIN questions AS q ON (q.id = v.question_id)
  LEFT JOIN instance_questions AS iq ON (iq.id = v.instance_question_id)
  LEFT JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
WHERE
  v.id = $variant_id;

-- BLOCK select_last_submission_of_variant
SELECT
  s.*
FROM
  submissions AS s
WHERE
  s.variant_id = $variant_id
ORDER BY
  s.date DESC,
  s.id DESC
LIMIT
  1;

-- BLOCK update_variant_true_answer
WITH
  updated_variant AS (
    UPDATE variants
    SET
      params = $params,
      true_answer = $true_answer,
      modified_at = now()
    WHERE
      id = $variant_id
    RETURNING
      *
  )
SELECT
  v.*,
  iq.open AS instance_question_open,
  iq.assessment_instance_id,
  ai.open AS assessment_instance_open,
  aq.max_manual_points
FROM
  updated_variant v
  LEFT JOIN instance_questions iq ON (v.instance_question_id = iq.id)
  LEFT JOIN assessment_instances ai ON (iq.assessment_instance_id = ai.id)
  LEFT JOIN assessment_questions aq ON (iq.assessment_question_id = aq.id);

-- BLOCK select_and_update_last_access
WITH
  previous_last_access AS (
    SELECT
      COALESCE(NOW() - last_access, INTERVAL '0 seconds') AS full_delta
    FROM
      last_accesses AS la
    WHERE
      (
        CASE
          WHEN $user_id::bigint IS NOT NULL THEN la.user_id = $user_id
          ELSE la.group_id = $group_id
        END
      )
  ),
  updated_last_access AS (
    UPDATE last_accesses AS la
    SET
      last_access = NOW()
    WHERE
      (
        CASE
          WHEN $user_id::bigint IS NOT NULL THEN la.user_id = $user_id
          ELSE la.group_id = $group_id
        END
      )
  )
SELECT
  (
    CASE
      WHEN full_delta > interval '1 hour' THEN interval '0 seconds'
      ELSE full_delta
    END
  ) AS delta
FROM
  previous_last_access;

-- BLOCK insert_submission
WITH
  updated_variant AS (
    UPDATE variants
    SET
      duration = duration + ($delta * interval '1 ms'),
      first_duration = coalesce(first_duration, $delta * interval '1 ms'),
      modified_at = now()
    WHERE
      id = $variant_id
  ),
  canceled_jobs AS (
    -- Cancel any outstanding grading jobs for the variant in previous
    -- submissions. For student variants, this ensures that if a new submission
    -- is made while a previous submission is still being graded, the previous
    -- grading job will not affect the overall instance question grade and
    -- status. For instructor preview and public preview variants, this is done
    -- for consistency.
    UPDATE grading_jobs AS gj
    SET
      grading_request_canceled_at = now(),
      grading_request_canceled_by = $auth_user_id
    FROM
      submissions AS s
    WHERE
      s.variant_id = $variant_id
      AND gj.submission_id = s.id
      AND gj.graded_at IS NULL
      AND gj.grading_requested_at IS NOT NULL
      AND gj.grading_request_canceled_at IS NULL
    RETURNING
      gj.*
  ),
  canceled_job_submissions AS (
    UPDATE submissions AS s
    SET
      grading_requested_at = NULL,
      modified_at = now()
    FROM
      canceled_jobs AS cj
    WHERE
      s.id = cj.submission_id
  )
INSERT INTO
  submissions (
    variant_id,
    auth_user_id,
    raw_submitted_answer,
    submitted_answer,
    format_errors,
    credit,
    mode,
    duration,
    params,
    true_answer,
    feedback,
    gradable,
    broken,
    client_fingerprint_id
  )
VALUES
  (
    $variant_id,
    $auth_user_id,
    $raw_submitted_answer,
    $submitted_answer,
    $format_errors,
    $credit,
    $mode,
    $delta * interval '1 ms',
    $params,
    $true_answer,
    $feedback,
    $gradable,
    $broken,
    $client_fingerprint_id
  )
RETURNING
  id;

-- BLOCK update_instance_question_post_submission
WITH
  updated_instance_question AS (
    UPDATE instance_questions
    SET
      status = $status,
      duration = duration + ($delta * interval '1 ms'),
      first_duration = coalesce(first_duration, $delta * interval '1 ms'),
      modified_at = now(),
      requires_manual_grading = (
        requires_manual_grading
        OR $requires_manual_grading
      ),
      is_ai_graded = FALSE
    WHERE
      id = $instance_question_id
  )
UPDATE assessment_instances
SET
  duration = duration + ($delta * interval '1 ms'),
  modified_at = now()
WHERE
  id = $assessment_instance_id;
