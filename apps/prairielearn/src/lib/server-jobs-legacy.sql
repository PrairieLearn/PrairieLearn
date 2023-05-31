-- BLOCK select_job
SELECT
  j.*
FROM
  jobs AS j
WHERE
  j.id = $job_id;

-- BLOCK select_job_sequence
SELECT
  js.*,
  (
    SELECT
      count(*)
    FROM
      jobs
    WHERE
      job_sequence_id = $job_sequence_id
  ) AS job_count
FROM
  job_sequences AS js
WHERE
  js.id = $job_sequence_id;

-- BLOCK insert_job
WITH
  max_over_jobs_with_same_sequence AS (
    SELECT
      coalesce(max(j.number_in_sequence) + 1, 1) AS new_number_in_sequence
    FROM
      jobs AS j
    WHERE
      j.course_id IS NOT DISTINCT FROM $course_id
      AND j.job_sequence_id = $job_sequence_id
      AND j.job_sequence_id IS NOT NULL
  )
INSERT INTO
  jobs (
    course_id,
    course_instance_id,
    course_request_id,
    assessment_id,
    job_sequence_id,
    number_in_sequence,
    last_in_sequence,
    no_job_sequence_update,
    user_id,
    authn_user_id,
    type,
    description,
    status,
    command,
    arguments,
    working_directory,
    env
  )
SELECT
  $course_id,
  $course_instance_id,
  $course_request_id,
  $assessment_id,
  $job_sequence_id,
  new_number_in_sequence,
  $last_in_sequence,
  $no_job_sequence_update,
  $user_id,
  $authn_user_id,
  $type,
  $description,
  'Running',
  $command,
  $arguments::TEXT[],
  $working_directory,
  $env
FROM
  max_over_jobs_with_same_sequence
RETURNING
  jobs.id;

-- BLOCK insert_job_sequence
WITH
  max_over_job_sequences_with_same_course AS (
    SELECT
      coalesce(max(js.number) + 1, 1) AS new_number
    FROM
      job_sequences AS js
    WHERE
      js.course_id IS NOT DISTINCT FROM $course_id
  )
INSERT INTO
  job_sequences (
    course_id,
    course_instance_id,
    course_request_id,
    assessment_id,
    number,
    user_id,
    authn_user_id,
    type,
    description
  )
SELECT
  $course_id,
  $course_instance_id,
  $course_request_id,
  $assessment_id,
  new_number,
  $user_id,
  $authn_user_id,
  $type,
  $description
FROM
  max_over_job_sequences_with_same_course
RETURNING
  id;

-- BLOCK update_job_on_close
WITH
  updated_jobs AS (
    UPDATE jobs AS j
    SET
      finish_date = CURRENT_TIMESTAMP,
      status = CASE
        WHEN $exit_code = 0 THEN 'Success'::enum_job_status
        ELSE 'Error'::enum_job_status
      END,
      output = $output,
      exit_code = $exit_code,
      exit_signal = $exit_signal
    WHERE
      j.id = $job_id
      -- Ensure we can't finish the same job multiple times.
      AND status = 'Running'
    RETURNING
      j.*
  ),
  job_sequence_updates AS (
    SELECT
      j.*,
      CASE
        WHEN j.no_job_sequence_update THEN FALSE
        WHEN j.status = 'Error' THEN TRUE
        WHEN j.last_in_sequence THEN TRUE
        ELSE FALSE
      END AS update_job_sequence
    FROM
      updated_jobs AS j
  ),
  update_results AS (
    UPDATE job_sequences AS js
    SET
      finish_date = j.finish_date,
      status = j.status
    FROM
      job_sequence_updates AS j
    WHERE
      js.id = j.job_sequence_id
      AND j.update_job_sequence
  )
SELECT
  j.*
FROM
  updated_jobs AS j;

-- BLOCK update_job_on_error
WITH
  updated_jobs AS (
    UPDATE jobs AS j
    SET
      finish_date = CURRENT_TIMESTAMP,
      status = 'Error'::enum_job_status,
      output = $output,
      error_message = $error_message
    WHERE
      j.id = $job_id
      -- Ensure we can't finish the same job multiple times.
      AND status = 'Running'::enum_job_status
    RETURNING
      j.*
  ),
  job_sequence_updates AS (
    SELECT
      j.*,
      CASE
        WHEN j.no_job_sequence_update THEN FALSE
        ELSE TRUE
      END AS update_job_sequence
    FROM
      updated_jobs AS j
  )
UPDATE job_sequences AS js
SET
  finish_date = j.finish_date,
  status = j.status
FROM
  job_sequence_updates AS j
WHERE
  js.id = j.job_sequence_id
  AND j.update_job_sequence;

-- BLOCK select_running_jobs
SELECT
  j.id,
  j.job_sequence_id
FROM
  jobs AS j
WHERE
  j.status = 'Running';

-- BLOCK select_abandoned_jobs
SELECT
  id,
  job_sequence_id
FROM
  jobs AS j
WHERE
  j.status = 'Running'
  AND j.heartbeat_at < (
    CURRENT_TIMESTAMP - make_interval(secs => $timeout_secs)
  );

-- BLOCK error_abandoned_job_sequences
UPDATE job_sequences AS js
SET
  status = 'Error',
  finish_date = CURRENT_TIMESTAMP
WHERE
  js.status = 'Running'
  AND age (js.start_date) > interval '1 hours'
  AND (
    (
      SELECT
        count(*)
      FROM
        jobs AS j
      WHERE
        j.job_sequence_id = js.id
    ) = 0 -- no jobs
    OR (
      SELECT
        bool_and(
          j.status != 'Running'
          AND age (j.finish_date) > interval '1 hours'
        )
      FROM
        jobs AS j
      WHERE
        j.job_sequence_id = js.id
    ) -- no running jobs and no recently finished jobs
  )
RETURNING
  js.id;

-- BLOCK fail_job_sequence
UPDATE job_sequences AS js
SET
  finish_date = CURRENT_TIMESTAMP,
  status = 'Error'
WHERE
  js.id = $job_sequence_id;

-- BLOCK select_job_sequence_with_course_id_as_json
WITH
  member_jobs AS (
    SELECT
      j.*,
      format_date_full_compact (j.start_date, coalesce(c.display_timezone, 'UTC')) AS start_date_formatted,
      format_date_full_compact (
        j.finish_date,
        coalesce(c.display_timezone, 'UTC')
      ) AS finish_date_formatted,
      u.uid AS user_uid,
      authn_u.uid AS authn_user_uid
    FROM
      jobs AS j
      LEFT JOIN pl_courses AS c ON (c.id = j.course_id)
      LEFT JOIN users AS u ON (u.user_id = j.user_id)
      LEFT JOIN users AS authn_u ON (authn_u.user_id = j.authn_user_id)
    WHERE
      j.job_sequence_id = $job_sequence_id
      AND j.course_id IS NOT DISTINCT FROM $course_id
    ORDER BY
      j.number_in_sequence,
      j.id
  ),
  aggregated_member_jobs AS (
    SELECT
      count(*) AS job_count,
      coalesce(array_agg(to_jsonb(j.*)), ARRAY[]::JSONB[]) AS jobs
    FROM
      member_jobs AS j
  )
SELECT
  js.*,
  format_date_full_compact (
    js.start_date,
    coalesce(c.display_timezone, 'UTC')
  ) AS start_date_formatted,
  format_date_full_compact (
    js.finish_date,
    coalesce(c.display_timezone, 'UTC')
  ) AS finish_date_formatted,
  u.uid AS user_uid,
  authn_u.uid AS authn_user_uid,
  aggregated_member_jobs.*
FROM
  job_sequences AS js
  LEFT JOIN pl_courses AS c ON (c.id = js.course_id)
  LEFT JOIN users AS u ON (u.user_id = js.user_id)
  LEFT JOIN users AS authn_u ON (authn_u.user_id = js.authn_user_id),
  aggregated_member_jobs
WHERE
  js.id = $job_sequence_id
  AND js.course_id IS NOT DISTINCT FROM $course_id;

-- BLOCK update_heartbeats
UPDATE jobs AS j
SET
  heartbeat_at = CURRENT_TIMESTAMP
WHERE
  j.id IN (
    SELECT
      UNNEST($job_ids::bigint[])
  );
