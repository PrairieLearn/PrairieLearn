-- BLOCK instance_questions_manually_grade_submission
DROP FUNCTION IF EXISTS instance_questions_manually_grade_submission(bigint, bigint, double precision, text, jsonb);

CREATE OR REPLACE FUNCTION
    instance_questions_manually_grade_submission(
        IN arg_instance_question_id bigint,
        IN arg_user_id bigint,
        IN arg_score double precision,
        IN arg_modified_at text,
        IN arg_manual_note jsonb,
        OUT instance_question jsonb
    )
AS $$
DECLARE
    instance_question_modified_at timestamp;
    instance_question_id bigint;
    assessment_question_id bigint;
    last_submission submissions%rowtype;
    is_conflict boolean;
BEGIN

    SELECT iq.id, iq.assessment_question_id, iq.modified_at
    INTO instance_question_id, assessment_question_id, instance_question_modified_at
    FROM
        instance_questions AS iq
    WHERE
        iq.id = arg_instance_question_id
    FOR UPDATE;

    IF NOT FOUND THEN RAISE EXCEPTION 'instance question not found: %', arg_instance_question_id; END IF;

    IF instance_question_modified_at > arg_modified_at::timestamp THEN
        is_conflict = TRUE;
    END IF;

    -- Create grading job even if a grading job spin-lock conflict will exist
    SELECT s.*
    INTO last_submission
    FROM
        instance_questions AS iq
        JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
        JOIN questions AS q ON (q.id = aq.question_id)
        JOIN variants AS v ON (v.instance_question_id = iq.id)
        JOIN submissions AS s ON (s.variant_id = v.id)
        JOIN users AS u ON (u.user_id = iq.manual_grading_user)
    WHERE iq.id = arg_instance_question_id
    ORDER BY s.date DESC, s.id DESC
    LIMIT 1;

    PERFORM instance_questions_assign_manual_grading_user(assessment_question_id, instance_question_id, arg_user_id);
    PERFORM grading_jobs_insert_manual(last_submission.id, arg_user_id, arg_score, arg_manual_note);

    -- Mark grading conflict to resolve in next load of instructorQuestionManualGrading view
    UPDATE instance_questions AS iq
    SET
        manual_grading_conflict = is_conflict
    WHERE
        id = arg_instance_question_id
    RETURNING to_json(iq.*)
    INTO instance_question;

END;
$$ LANGUAGE plpgsql VOLATILE;
