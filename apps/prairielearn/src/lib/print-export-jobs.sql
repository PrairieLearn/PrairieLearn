-- BLOCK select_print_export_job
SELECT
  js.status,
  js.finish_date,
  j.data
FROM
  job_sequences AS js
  JOIN jobs AS j ON j.job_sequence_id = js.id
WHERE
  js.id = $job_sequence_id
  AND js.assessment_id = $assessment_id
  AND js.authn_user_id = $authn_user_id
  AND js.type = 'print_export';

-- BLOCK select_expired_print_exports
SELECT
  j.id,
  coalesce(j.data ->> 'inputKey', j.data ->> 'key') AS key
FROM
  jobs AS j
WHERE
  j.type = 'print_export'
  AND j.finish_date < CURRENT_TIMESTAMP - INTERVAL '24 hours'
  AND (
    j.data ? 'key'
    OR j.data ? 'inputKey'
  )
LIMIT
  100;

-- BLOCK mark_print_export_expired
UPDATE jobs
SET
  data = CASE
    WHEN data ->> 'inputKey' = $key THEN data - 'inputKey'
    ELSE data - 'key'
  END
WHERE
  id = $job_id
  AND (
    data ->> 'key' = $key
    OR data ->> 'inputKey' = $key
  );

-- BLOCK clear_print_export_input_key
UPDATE jobs
SET
  data = data - 'inputKey'
WHERE
  id = $job_id
  AND data ->> 'inputKey' = $input_key;

-- BLOCK lock_course_job_sequence
SELECT
  pg_advisory_xact_lock(1, $course_id::integer);

-- BLOCK insert_print_export_job
WITH
  new_job_sequence AS (
    INSERT INTO
      job_sequences (
        course_id,
        course_instance_id,
        assessment_id,
        number,
        user_id,
        authn_user_id,
        type,
        description,
        status,
        legacy
      )
    SELECT
      $course_id,
      $course_instance_id,
      $assessment_id,
      coalesce(max(js.number) + 1, 1),
      $user_id,
      $authn_user_id,
      'print_export',
      $description,
      'Running'::enum_job_status,
      FALSE
    FROM
      job_sequences AS js
    WHERE
      js.course_id = $course_id
    RETURNING
      id
  ),
  job AS (
    INSERT INTO
      jobs (
        course_id,
        course_instance_id,
        assessment_id,
        job_sequence_id,
        number_in_sequence,
        last_in_sequence,
        user_id,
        authn_user_id,
        type,
        description,
        status,
        data
      )
    SELECT
      $course_id,
      $course_instance_id,
      $assessment_id,
      new_job_sequence.id,
      1,
      TRUE,
      $user_id,
      $authn_user_id,
      'print_export',
      $description,
      'Running'::enum_job_status,
      $data::jsonb
    FROM
      new_job_sequence
    RETURNING
      id
  )
SELECT
  new_job_sequence.id AS job_sequence_id,
  job.id AS job_id
FROM
  new_job_sequence,
  job;

-- BLOCK select_pending_print_exports
SELECT
  j.id,
  j.course_id
FROM
  jobs AS j
WHERE
  j.id > $after_id
  AND j.type = 'print_export'
  AND j.status = 'Running'
  AND j.data ? 'inputKey'
ORDER BY
  j.id
LIMIT
  100;

-- BLOCK claim_print_export_job
UPDATE jobs AS j
SET
  data = j.data || jsonb_build_object(
    'runOwner',
    $owner::text,
    'attempts',
    coalesce((j.data ->> 'attempts')::integer, 0) + 1
  ),
  heartbeat_at = CURRENT_TIMESTAMP
WHERE
  j.id = $job_id
  AND j.type = 'print_export'
  AND j.status = 'Running'
  AND j.data ? 'inputKey'
RETURNING
  j.id,
  j.job_sequence_id,
  j.start_date AS queued_at,
  j.data ->> 'inputKey' AS input_key,
  j.data ->> 'document' AS document,
  j.data ->> 'format' AS format,
  (j.data ->> 'attempts')::integer AS attempts;

-- BLOCK release_print_export_job
UPDATE jobs
SET
  data = (data - 'runOwner') || jsonb_build_object(
    'attempts',
    greatest(
      coalesce((data ->> 'attempts')::integer, 0) - 1,
      0
    )
  )
WHERE
  id = $job_id
  AND status = 'Running'
  AND data ->> 'runOwner' = $owner;

-- BLOCK finish_print_export_job
UPDATE jobs
SET
  status = $status::enum_job_status,
  finish_date = CURRENT_TIMESTAMP,
  heartbeat_at = CURRENT_TIMESTAMP,
  data = $data::jsonb,
  output = $output
WHERE
  id = $job_id
  AND status = 'Running'
  AND data ->> 'runOwner' = $owner;

-- BLOCK finish_print_export_sequence
UPDATE job_sequences
SET
  status = $status::enum_job_status,
  finish_date = CURRENT_TIMESTAMP
WHERE
  id = $job_sequence_id
  AND status = 'Running';
