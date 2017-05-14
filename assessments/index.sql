-- BLOCK select_assessment_info
SELECT
    a.type AS assessment_type,
    ai.id AS assessment_instance_id
FROM
    grading_jobs AS gj
    JOIN submissions AS s ON (s.id = gj.submission_id)
    JOIN variants AS v ON (v.id = s.variant_id)
    JOIN instance_questions AS iq ON (iq.id = v.instance_question_id)
    JOIN assessment_instances AS ai ON (ai.id = iq.assessment_instance_id)
    JOIN assessments AS a ON (a.id = ai.assessment_id)
WHERE
    gj.id = $grading_job_id;
