-- BLOCK select_upload_job_sequences
SELECT
    js.*,
    format_date_full_compact(js.start_date, c.display_timezone) AS start_date_formatted,
    u.uid AS user_uid
FROM
    job_sequences AS js
    JOIN pl_courses AS c ON (c.id = js.course_id)
    JOIN users AS u on (u.user_id = js.user_id)
WHERE
    js.assessment_id = $assessment_id
    AND (js.type = 'upload_instance_question_scores' OR js.type = 'upload_assessment_instance_scores')
ORDER BY
    js.start_date DESC, js.id;
