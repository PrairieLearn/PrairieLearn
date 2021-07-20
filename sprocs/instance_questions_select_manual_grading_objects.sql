-- BLOCK instance_questions_select_manual_grading_objects

CREATE FUNCTION
    instance_questions_select_manual_grading_objects(
        IN arg_instance_question_id bigint,
        IN arg_user_id bigint,
        IN arg_conflicting_grading_job_id bigint,
        IN arg_manual_grading_expiry text,
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
        SELECT json_build_object('id', gj.id, 'score', gj.score, 'feedback', gj.feedback, 'graded_by', CONCAT(u.name, ' (', u.uid, ')'), 'diffType', 'grading_job')
        INTO incoming_conflict
        FROM
            grading_jobs AS gj
            JOIN users AS u ON (u.user_id = gj.auth_user_id)
        WHERE gj.id = arg_conflicting_grading_job_id;
    ELSE
        -- always check if grading conflict needs to be resolved
        SELECT json_build_object('id', gj.id, 'score', gj.score, 'feedback', gj.feedback, 'graded_by', CONCAT(u.name, ' (', u.uid, ')'), 'diffType', 'grading_job')
        INTO incoming_conflict
        FROM
            grading_jobs AS gj
            JOIN submissions AS s ON (s.id = gj.submission_id)
            JOIN variants AS v ON (v.id = s.variant_id)
            JOIN instance_questions AS iq ON (iq.id = v.instance_question_id)
            JOIN users AS u ON (u.user_id = gj.auth_user_id)
        WHERE
            iq.id = arg_instance_question_id
            AND gj.manual_grading_conflict IS TRUE
        LIMIT 1;
    END IF;

    SELECT to_jsonb(iq.*), to_jsonb(q.*), to_jsonb(v.*), to_jsonb(s.*), to_jsonb(aq.*)
    INTO instance_question, question, variant, submission, assessment_question
    FROM
        instance_questions AS iq
        JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
        JOIN questions AS q ON (q.id = aq.question_id)
        JOIN variants AS v ON (v.instance_question_id = iq.id)
        JOIN submissions AS s ON (s.variant_id = v.id)
    WHERE iq.id = arg_instance_question_id
    ORDER BY s.date DESC, s.id DESC
    LIMIT 1;

    SELECT to_jsonb(u.*)
    INTO grading_user
    FROM
        instance_questions AS iq
        JOIN users_manual_grading AS umg ON (iq.id = umg.instance_question_id)
        JOIN users AS u ON (u.user_id = umg.user_id)
        JOIN variants AS v ON (v.instance_question_id = iq.id)
        JOIN submissions AS s ON (s.variant_id = v.id)
        LEFT JOIN grading_jobs AS gj ON (s.id = gj.submission_id)
    WHERE
        iq.id = arg_instance_question_id
        AND
        -- grading user conflict auth user is still the manual grading user even beyond manual grading expiry time
        (
            (gj.manual_grading_conflict IS TRUE
            AND umg.user_id = gj.auth_user_id)
            OR
            (umg.date_started >= (NOW() - arg_manual_grading_expiry::interval))
        )
    ORDER BY s.date DESC, s.id DESC, umg.date_started ASC
    LIMIT 1;

END;
$$ LANGUAGE plpgsql VOLATILE;
