-- BLOCK select_job
SELECT
    j.*
FROM
    jobs AS j
WHERE
    j.id = $job_id;

-- BLOCK insert_job
WITH max_over_jobs_with_same_course AS (
    SELECT
        coalesce(max(j.number) + 1, 1) AS new_number
    FROM
        jobs AS j
    WHERE
        j.course_id = $course_id
),
max_over_jobs_with_same_parent AS (
    SELECT
        coalesce(max(j.child_number) + 1, 1) AS new_child_number
    FROM
        jobs AS j
    WHERE
        j.course_id = $course_id
        AND j.parent_job_id = $parent_job_id
)
INSERT INTO jobs
    (course_id, number,      parent_job_id, child_number,
     user_id,  authn_user_id,  type,  status,    command,
     arguments,          working_directory)
SELECT
    $course_id, new_number, $parent_job_id, new_child_number,
    $user_id, $authn_user_id, $type, 'Running', $command,
    $arguments::TEXT[], $working_directory
FROM
    max_over_jobs_with_same_course,
    max_over_jobs_with_same_parent
RETURNING jobs.id;

-- BLOCK update_job_on_close
UPDATE jobs AS j
SET
    finish_date = CURRENT_TIMESTAMP,
    status = CASE WHEN $exit_code = 0 THEN 'Success'::enum_job_status ELSE 'Error'::enum_job_status END,
    stderr = $stderr,
    stdout = $stdout,
    exit_code = $exit_code,
    exit_signal = $exit_signal
WHERE
    j.id = $job_id;

-- BLOCK update_job_on_error
UPDATE jobs AS j
SET
    finish_date = CURRENT_TIMESTAMP,
    status = 'Error'::enum_job_status,
    error_message = $error_message
WHERE
    j.id = $job_id;
