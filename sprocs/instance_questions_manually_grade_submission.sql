-- BLOCK instance_questions_manually_grade_submission
DROP FUNCTION IF EXISTS instance_questions_manually_grade_submission(bigint, bigint, double precision, text, jsonb);

CREATE OR REPLACE FUNCTION
    instance_questions_manually_grade_submission(
        IN arg_instance_question_id bigint,
        IN arg_user_id bigint,
        IN arg_score double precision,
        IN arg_modified_at text,
        IN arg_manual_note jsonb,
        IN arg_grading_job_id bigint,
        OUT instance_question jsonb,
        OUT grading_job jsonb
    )
AS $$
DECLARE
    instance_question_modified_at timestamp;
    instance_question_id bigint;
    assessment_question_id bigint;
    last_submission submissions%rowtype;
    last_submission_id bigint;
    is_conflict boolean;
BEGIN

    SELECT iq.id, iq.assessment_question_id, iq.modified_at, s.id
    INTO instance_question_id, assessment_question_id, instance_question_modified_at, last_submission_id
    FROM
        instance_questions AS iq
        JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
        JOIN questions AS q ON (q.id = aq.question_id)
        JOIN variants AS v ON (v.instance_question_id = iq.id)
        JOIN submissions AS s ON (s.variant_id = v.id)
    WHERE iq.id = arg_instance_question_id
    ORDER BY s.date DESC, s.id DESC
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND THEN RAISE EXCEPTION 'instance question not found: %', arg_instance_question_id; END IF;

    IF instance_question_modified_at != arg_modified_at::timestamp THEN
        is_conflict = TRUE;
    END IF;

    -- Create grading job even if a conflict will exist
    SELECT s.*
    INTO last_submission
    FROM
        instance_questions AS iq
        JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
        JOIN questions AS q ON (q.id = aq.question_id)
        JOIN variants AS v ON (v.instance_question_id = iq.id)
        JOIN submissions AS s ON (s.variant_id = v.id)
    WHERE iq.id = arg_instance_question_id
    ORDER BY s.date DESC, s.id DESC
    LIMIT 1;

    instance_question := instance_questions_assign_manual_grading_user(assessment_question_id, instance_question_id, arg_user_id);
    grading_job := to_jsonb(grading_jobs_insert_manual(last_submission.id, arg_user_id, arg_score, arg_manual_note, is_conflict));

    -- Resolve original conflict even if a new one occurs
    IF arg_grading_job_id IS NOT NULL THEN
        UPDATE grading_jobs
        SET manual_grading_conflict = FALSE
        WHERE id = arg_grading_job_id;
    END IF;

END;
$$ LANGUAGE plpgsql VOLATILE;
