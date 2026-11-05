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
        finish_date,
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
      $status::enum_job_status,
      CASE
        WHEN $status = 'Success' THEN CURRENT_TIMESTAMP
        ELSE NULL
      END,
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
        finish_date,
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
      $status::enum_job_status,
      CASE
        WHEN $status = 'Success' THEN CURRENT_TIMESTAMP
        ELSE NULL
      END,
      $data::jsonb
    FROM
      new_job_sequence
  )
SELECT
  id AS job_sequence_id
FROM
  new_job_sequence;

-- BLOCK lock_print_export_queue
SELECT
  pg_advisory_xact_lock(2, 0);

-- BLOCK fail_exhausted_print_exports
WITH
  failed AS (
    UPDATE jobs AS j
    SET
      status = 'Error',
      finish_date = CURRENT_TIMESTAMP,
      data = jsonb_build_object(
        'inputKey',
        j.data ->> 'inputKey',
        'failureMessage',
        'The export stopped repeatedly while rendering. Try fewer forms or contact support.'
      ),
      output = 'Print export worker lease expired three times'
    WHERE
      j.type = 'print_export'
      AND j.status = 'Running'
      AND j.data ? 'inputKey'
      AND coalesce((j.data ->> 'attempts')::integer, 0) >= 3
      AND (j.data ->> 'leaseUntil')::timestamptz <= CURRENT_TIMESTAMP
    RETURNING
      j.id,
      j.job_sequence_id,
      j.data ->> 'inputKey' AS input_key
  ),
  updated_job_sequences AS (
    UPDATE job_sequences AS js
    SET
      status = 'Error',
      finish_date = CURRENT_TIMESTAMP
    FROM
      failed
    WHERE
      js.id = failed.job_sequence_id
      AND js.status = 'Running'
  )
SELECT
  id,
  input_key
FROM
  failed;

-- BLOCK claim_print_exports
WITH
  active AS (
    SELECT
      count(*) AS count
    FROM
      jobs
    WHERE
      type = 'print_export'
      AND status = 'Running'
      AND data ? 'leaseOwner'
      AND (data ->> 'leaseUntil')::timestamptz > CURRENT_TIMESTAMP
  ),
  pending AS (
    SELECT
      j.id
    FROM
      jobs AS j
    WHERE
      j.type = 'print_export'
      AND j.status = 'Running'
      AND j.data ? 'inputKey'
      AND (
        NOT (j.data ? 'leaseUntil')
        OR (j.data ->> 'leaseUntil')::timestamptz <= CURRENT_TIMESTAMP
      )
    ORDER BY
      j.id
    LIMIT
      greatest(
        0,
        $limit::integer - (
          SELECT
            count
          FROM
            active
        )
      )
    FOR UPDATE OF
      j SKIP LOCKED
  )
UPDATE jobs AS j
SET
  data = j.data || jsonb_build_object(
    'leaseOwner',
    $owner::text,
    'leaseUntil',
    (CURRENT_TIMESTAMP + INTERVAL '5 minutes')::text,
    'attempts',
    coalesce((j.data ->> 'attempts')::integer, 0) + 1
  ),
  heartbeat_at = CURRENT_TIMESTAMP
FROM
  pending
WHERE
  j.id = pending.id
RETURNING
  j.id,
  j.job_sequence_id,
  j.start_date AS queued_at,
  j.data ->> 'inputKey' AS input_key,
  j.data ->> 'document' AS document;

-- BLOCK renew_print_export_lease
UPDATE jobs
SET
  data = jsonb_set(
    data,
    '{leaseUntil}',
    to_jsonb((CURRENT_TIMESTAMP + INTERVAL '5 minutes')::text)
  ),
  heartbeat_at = CURRENT_TIMESTAMP
WHERE
  id = $job_id
  AND status = 'Running'
  AND data ->> 'leaseOwner' = $owner;

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
  AND data ->> 'leaseOwner' = $owner;

-- BLOCK finish_print_export_sequence
UPDATE job_sequences
SET
  status = $status::enum_job_status,
  finish_date = CURRENT_TIMESTAMP
WHERE
  id = $job_sequence_id
  AND status = 'Running';
