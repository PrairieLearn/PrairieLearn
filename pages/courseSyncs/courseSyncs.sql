-- BLOCK select_sync_job_sequences
SELECT
    js.*,
    format_date_full_compact(js.start_date, c.display_timezone) AS start_date_formatted,
    u.uid AS user_uid
FROM
    job_sequences AS js
    JOIN pl_courses AS c ON (c.id = js.course_id)
    JOIN users AS u on (u.user_id = js.user_id)
WHERE
    c.id = $course_id
    AND (js.type = 'sync' OR js.type = 'git_status' OR js.type = 'images_sync')
ORDER BY
    js.start_date DESC, js.id;

-- BLOCK question_images
SELECT
    external_grading_image,
    coalesce(jsonb_agg(jsonb_build_object(
        'id', q.id,
        'qid', q.qid
    ) ORDER BY q.qid), '[]'::jsonb) AS questions
FROM
    questions AS q
WHERE
    q.course_id = $course_id
    AND q.deleted_at IS NULL
    AND external_grading_image IS NOT NULL
GROUP BY
    external_grading_image
ORDER BY
    external_grading_image

-- BLOCK format_pushed_at
SELECT
    format_date_full_compact(pushed_at, c.display_timezone) AS pushed_at_formatted
FROM
    unnest($pushed_at_array) AS pushed_at
    JOIN pl_courses AS c ON (c.id = $course_id);
