-- BLOCK get_variant_by_iq
SELECT *
FROM variants
WHERE instance_question_id = $iqId
LIMIT 1;

-- BLOCK get_grading_jobs_by_iq
SELECT *
FROM 
    grading_jobs AS gj
    JOIN submissions AS s ON (gj.submission_id = s.id)
    JOIN variants AS v ON (s.variant_id = v.id)
    JOIN instance_questions AS iq ON (v.instance_question_id = iq.id)
WHERE instance_question_id = $iqId;
