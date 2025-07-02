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
  canceled_jobs AS (
    -- Cancel any outstanding grading jobs
    UPDATE grading_jobs AS gj
    SET
      grading_request_canceled_at = now(),
      grading_request_canceled_by = $authn_user_id
    FROM
      grading_job_data AS gjd
      JOIN variants AS v ON (v.id = gjd.variant_id)
      JOIN submissions AS s ON (s.variant_id = v.id)
    WHERE
      gj.submission_id = s.id
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
      canceled_jobs
    WHERE
      s.id = canceled_jobs.submission_id
      AND s.id != $submission_id
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
