CREATE FUNCTION
    grading_jobs_lock (
        grading_job_id bigint
    ) RETURNS void
AS $$
DECLARE
    variant_id bigint;
    assessment_instance_id bigint;
BEGIN
    SELECT     v.id,                  ai.id
    INTO variant_id, assessment_instance_id
    FROM
        grading_jobs AS gj
        JOIN submissions AS s ON (s.id = gj.submission_id)
        JOIN variants AS v ON (v.id = s.variant_id)
        LEFT JOIN instance_questions AS iq ON (iq.id = v.instance_question_id)
        LEFT JOIN assessment_instances AS ai ON (ai.id = iq.assessment_instance_id)
    WHERE gj.id = grading_job_id;

    IF NOT FOUND THEN RAISE EXCEPTION 'no such grading_job_id: %', grading_job_id; END IF;

    IF assessment_instance_id IS NOT NULL THEN
        -- lock the assessment_instance
        PERFORM ai.id
        FROM assessment_instances AS ai
        WHERE ai.id = assessment_instance_id
        FOR NO KEY UPDATE OF ai;
    ELSE
        -- lock the variant
        PERFORM v.id
        FROM variants AS v
        WHERE v.id = variant_id
        FOR NO KEY UPDATE OF v;
    END IF;
END;
$$ LANGUAGE plpgsql VOLATILE;
