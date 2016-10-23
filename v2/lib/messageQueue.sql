-- BLOCK insert_grading_log
INSERT INTO grading_logs
        (submission_id,  grading_type, external_grading_started_at, auth_user_id)
VALUES  $submission_id, $grading_type, current_timestamp,          $auth_user_id
RETURNING id;

-- BLOCK select_assessment_info
SELECT
    a.type AS assessment_type,
    ai.id AS assessment_instance_id
FROM
    grading_logs AS gl
    JOIN submissions AS s ON (s.id = gl.submission_id)
    JOIN variants AS v ON (v.id = s.variant_id)
    JOIN instance_questions AS iq ON (iq.id = v.instance_question_id)
    JOIN assessment_instances AS ai ON (ai.id = iq.assessment_instance_id)
    JOIN assessments AS a ON (a.id = ai.assessment_id)
WHERE
    gl.id = $grading_log_id;
