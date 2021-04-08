-- BLOCK instance_questions_select_manual_grading_objects
DROP FUNCTION IF EXISTS instance_questions_select_manual_grading_objects(bigint, bigint, bigint);

CREATE OR REPLACE FUNCTION
    instance_questions_select_manual_grading_objects(
        IN arg_instance_question_id bigint,
        IN arg_user_id bigint,
        IN arg_conflicting_grading_job_id bigint,
        OUT instance_question jsonb,
        OUT question jsonb,
        OUT variant jsonb,
        OUT submission jsonb,
        OUT grading_user jsonb,
        OUT assessment_question jsonb,
        OUT incoming_conflict jsonb
    )
AS $$
DECLARE
    instance_question_id bigint;
    assessment_question_id bigint;
BEGIN

    SELECT iq.id, iq.assessment_question_id
    INTO instance_question_id, assessment_question_id
    FROM
        instance_questions AS iq
    WHERE
        iq.id = arg_instance_question_id
    FOR UPDATE;

    IF NOT FOUND THEN RAISE EXCEPTION 'instance question not found: %', arg_instance_question_id; END IF;

    PERFORM instance_questions_assign_manual_grading_user(assessment_question_id, instance_question_id, arg_user_id);

    -- conflict df: when TA 'x' submits manual grade while TA 'y' is grading same submission
    IF arg_conflicting_grading_job_id IS NOT NULL THEN
        SELECT json_build_object('score', gj.score, 'feedback', gj.feedback, 'graded_by', CONCAT(u.name, ' (', u.uid, ')'))
        INTO incoming_conflict
        FROM 
            grading_jobs AS gj
            JOIN users as u ON (u.user_id = gj.auth_user_id)
        WHERE id = arg_conflicting_grading_job_id;
    ELSE
        -- always check if grading conflict needs to be resolved
        SELECT json_build_object('score', gj.score, 'feedback', gj.feedback, 'graded_by', CONCAT(u.name, ' (', u.uid, ')'))
        INTO incoming_conflict
        FROM
            grading_jobs AS gj
            JOIN submissions AS s ON (s.id = gj.submission_id)
            JOIN variants AS v ON (v.id = s.variant_id)
            JOIN instance_questions AS iq ON (iq.id = v.instance_question_id)
            JOIN users as u ON (u.user_id = gj.auth_user_id)
        WHERE
            iq.id = arg_instance_question_id
            AND gj.manual_grading_conflict IS TRUE
        LIMIT 1;
    END IF;

    SELECT to_jsonb(iq.*), to_jsonb(q.*), to_jsonb(v.*), to_jsonb(s.*), to_jsonb(u.*), to_jsonb(aq.*)
    INTO instance_question, question, variant, submission, grading_user, assessment_question
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

END;
$$ LANGUAGE plpgsql VOLATILE;
