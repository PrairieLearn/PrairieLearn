-- BLOCK check_belongs
SELECT
    ai.id
FROM
    assessment_instances AS ai
    JOIN assessments AS a ON (a.id = ai.assessment_id)
WHERE
    ai.id = $assessment_instance_id
    AND a.id = $assessment_id;


-- BLOCK select_assessment_for_grading_job
SELECT
    ai.id AS assessment_instance_id
FROM
    grading_jobs AS gj
    JOIN submissions AS s ON (s.id = gj.submission_id)
    JOIN variants AS v ON (v.id = s.variant_id)
    LEFT JOIN instance_questions AS iq ON (iq.id = v.instance_question_id)
    LEFT JOIN assessment_instances AS ai ON (ai.id = iq.assessment_instance_id)
WHERE
    gj.id = $grading_job_id;
