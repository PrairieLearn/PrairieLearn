-- BLOCK select_sync_job_sequences
SELECT
    js.*,
    format_date_full_compact(js.start_date) AS start_date_formatted,
    u.uid AS user_uid
FROM
    job_sequences AS js
    JOIN users AS u on (u.id = js.user_id)
WHERE
    js.course_id = $course_id
    AND (js.type = 'sync' OR js.type = 'git_status')
ORDER BY
    js.start_date DESC, js.id;

-- BLOCK insert_job_sequence
WITH max_over_job_sequences_with_same_course AS (
    SELECT
        coalesce(max(js.number) + 1, 1) AS new_number
    FROM
        job_sequences AS js
    WHERE
        js.course_id = $course_id
)
INSERT INTO job_sequences
    (course_id, number,      user_id,  authn_user_id,  type,  description)
SELECT
    $course_id, new_number, $user_id, $authn_user_id, $type, $description
FROM
    max_over_job_sequences_with_same_course
RETURNING id;
