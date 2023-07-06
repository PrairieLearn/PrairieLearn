-- BLOCK insert_job_sequence
WITH
  max_over_job_sequences_with_same_course AS (
    SELECT
      coalesce(max(js.number) + 1, 1) AS new_number
    FROM
      job_sequences AS js
    WHERE
      js.course_id IS NOT DISTINCT FROM $course_id
  ),
  new_job_sequence AS (
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
        description,
        legacy
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
      $description,
      FALSE
    FROM
      max_over_job_sequences_with_same_course
    RETURNING
      id
  ),
  new_job AS (
    INSERT INTO
      jobs (
        course_id,
        course_instance_id,
        course_request_id,
        assessment_id,
        job_sequence_id,
        number_in_sequence,
        last_in_sequence,
        user_id,
        authn_user_id,
        type,
        description,
        status
      )
    SELECT
      $course_id,
      $course_instance_id,
      $course_request_id,
      $assessment_id,
      new_job_sequence.id,
      1,
      TRUE,
      $user_id,
      $authn_user_id,
      $type,
      $description,
      'Running'
    FROM
      new_job_sequence
    RETURNING
      jobs.id
  )
SELECT
  new_job_sequence.id AS job_sequence_id,
  new_job.id AS job_id
FROM
  new_job_sequence,
  new_job;

-- BLOCK update_job_on_finish
WITH
  updated_job AS (
    UPDATE jobs AS j
    SET
      finish_date = CURRENT_TIMESTAMP,
      status = $status::enum_job_status,
      output = $output,
      data = $data::jsonb
    WHERE
      j.id = $job_id
      AND j.status = 'Running'::enum_job_status
  )
UPDATE job_sequences AS js
SET
  finish_date = CURRENT_TIMESTAMP,
  status = $status::enum_job_status
WHERE
  js.id = $job_sequence_id
  AND js.status = 'Running'::enum_job_status;
