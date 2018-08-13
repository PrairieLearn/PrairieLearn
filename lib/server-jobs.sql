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
    (SELECT count(*) FROM jobs WHERE job_sequence_id = $job_sequence_id) AS job_count
FROM
    job_sequences AS js
WHERE
    js.id = $job_sequence_id;

-- BLOCK insert_job
WITH max_over_jobs_with_same_course AS (
    SELECT
        coalesce(max(j.number) + 1, 1) AS new_number
    FROM
        jobs AS j
    WHERE
        j.course_id IS NOT DISTINCT FROM $course_id
),
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
INSERT INTO jobs
    (course_id,  course_instance_id,  assessment_id, number,      job_sequence_id, number_in_sequence,      last_in_sequence,
     user_id,  authn_user_id,  type,  description,  status,    command,  arguments,          working_directory,  env)
SELECT
    $course_id, $course_instance_id, $assessment_id, new_number, $job_sequence_id, new_number_in_sequence, $last_in_sequence,
    $user_id, $authn_user_id, $type, $description, 'Running', $command, $arguments::TEXT[], $working_directory, $env
FROM
    max_over_jobs_with_same_course,
    max_over_jobs_with_same_sequence
RETURNING jobs.id;

-- BLOCK insert_job_sequence
WITH max_over_job_sequences_with_same_course AS (
    SELECT
        coalesce(max(js.number) + 1, 1) AS new_number
    FROM
        job_sequences AS js
    WHERE
        js.course_id IS NOT DISTINCT FROM $course_id
)
INSERT INTO job_sequences
    (course_id,  course_instance_id,  assessment_id, number,      user_id,  authn_user_id,  type,  description)
SELECT
    $course_id, $course_instance_id, $assessment_id, new_number, $user_id, $authn_user_id, $type, $description
FROM
    max_over_job_sequences_with_same_course
RETURNING id;

-- BLOCK update_job_on_close
WITH updated_jobs AS (
    UPDATE jobs AS j
    SET
        finish_date = CURRENT_TIMESTAMP,
        status = CASE WHEN $exit_code = 0 THEN 'Success'::enum_job_status ELSE 'Error'::enum_job_status END,
        stderr = $stderr,
        stdout = $stdout,
        output = $output,
        exit_code = $exit_code,
        exit_signal = $exit_signal
    WHERE
        j.id = $job_id
    RETURNING
        j.*
),
job_sequence_updates AS (
    SELECT
        j.*,
        CASE
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
WITH updated_jobs AS (
    UPDATE jobs AS j
    SET
        finish_date = CURRENT_TIMESTAMP,
        status = 'Error'::enum_job_status,
        stderr = $stderr,
        stdout = $stdout,
        output = $output,
        error_message = $error_message
    WHERE
        j.id = $job_id
    RETURNING
        j.*
)
UPDATE job_sequences AS js
SET
    finish_date = j.finish_date,
    status = j.status
FROM
    updated_jobs AS j
WHERE
    js.id = j.job_sequence_id;

-- BLOCK select_running_jobs
SELECT
    j.*
FROM
    jobs AS j
WHERE
    j.status = 'Running';

-- BLOCK error_abandoned_job_sequences
UPDATE job_sequences AS js
SET
    status = 'Error',
    finish_date = CURRENT_TIMESTAMP
WHERE
    js.status = 'Running'
    AND age(js.start_date) > interval '1 hours'
    AND (
        (SELECT count(*) FROM jobs AS j WHERE j.job_sequence_id = js.id) = 0 -- no jobs
        OR (SELECT bool_and(
                j.status != 'Running' AND age(j.finish_date) > interval '1 hours'
            ) FROM jobs AS j WHERE j.job_sequence_id = js.id
        ) -- no running jobs and no recently finished jobs
    )
RETURNING
    js.*;

-- BLOCK fail_job_sequence
UPDATE job_sequences AS js
SET
    finish_date = CURRENT_TIMESTAMP,
    status = 'Error'
WHERE
    js.id = $job_sequence_id;
