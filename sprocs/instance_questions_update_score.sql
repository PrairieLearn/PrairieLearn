DROP FUNCTION IF EXISTS instance_questions_update_score(bigint,bigint,bigint,bigint,text,integer,text,double precision,double precision,jsonb,bigint);

CREATE OR REPLACE FUNCTION
    instance_questions_update_score(
        -- identify the assessment/assessment_instance
        IN arg_assessment_id bigint,          -- must provide assessment_id
        IN arg_assessment_instance_id bigint, -- OR assessment_instance_id

        -- identify the instance_question/submission
        IN arg_submission_id bigint,        -- must provide submission_id
        IN arg_instance_question_id bigint, -- OR instance_question_id
        IN arg_uid text,                    -- OR (uid, assessment_instance_number, qid)
        IN arg_assessment_instance_number integer,
        IN arg_qid text,

        -- specify what should be updated
        IN arg_score_perc double precision,
        IN arg_points double precision,
        IN arg_feedback jsonb,
        IN arg_authn_user_id bigint
    ) RETURNS void
AS $$
DECLARE
    submission_id bigint;
    instance_question_id bigint;
    assessment_instance_id bigint;
    max_points double precision;
    new_score_perc double precision;
    new_points double precision;
    new_score double precision;
    new_correct boolean;
BEGIN
    -- ##################################################################
    -- get the assessment_instance, max_points, and (possibly) submission_id

    SELECT        s.id,                iq.id,                  ai.id, aq.max_points
    INTO submission_id, instance_question_id, assessment_instance_id,    max_points
    FROM
        instance_questions AS iq
        JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
        JOIN questions AS q on (q.id = aq.question_id)
        JOIN assessment_instances AS ai ON (ai.id = iq.assessment_instance_id)
        JOIN users AS u ON (u.user_id = ai.user_id)
        JOIN assessments AS a ON (a.id = ai.assessment_id)
        LEFT JOIN variants AS v ON (v.instance_question_id = iq.id)
        LEFT JOIN submissions AS s ON (s.variant_id = v.id)
    WHERE
        ( -- make sure we belong to the correct assessment/assessment_instance
            ai.id = arg_assessment_instance_id
            OR (arg_assessment_instance_id IS NULL AND a.id = arg_assessment_id)
        )
        AND
        ( -- make sure we have the correct instance_question/submission
            (s.id = arg_submission_id)
            OR (arg_submission_id IS NULL AND iq.id = arg_instance_question_id)
            OR (arg_submission_id IS NULL AND arg_instance_question_id IS NULL
                AND u.uid = arg_uid AND ai.number = arg_assessment_instance_number AND q.qid = arg_qid)
        )
    ORDER BY s.date DESC, ai.number DESC;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'could not locate submission_id=%, instance_question_id=%, uid=%, assessment_instance_number=%, qid=%, assessment_id=%, assessment_instance_id=%', arg_submission_id, arg_instance_question_id, arg_uid, arg_assessment_instance_number, arg_qid, arg_assessment_id, arg_assessment_instance_id;
    END IF;

    -- ##################################################################
    -- compute the new score_perc/points

    max_points := COALESCE(max_points, 0);

    IF arg_score_perc IS NOT NULL THEN
        IF arg_points IS NOT NULL THEN RAISE EXCEPTION 'Cannot set both score_perc and points'; END IF;
        new_score_perc := arg_score_perc;
        new_points := new_score_perc / 100 * max_points;
    ELSIF arg_points IS NOT NULL THEN
        new_points := arg_points;
        new_score_perc := (CASE WHEN max_points > 0 THEN new_points / max_points ELSE 0 END) * 100;
    ELSE
        new_points := NULL;
        new_score_perc := NULL;
    END IF;

    new_score := new_score_perc / 100;
    new_correct := (new_score > 0.5);

    -- ##################################################################
    -- if we were originally provided a submission_id or we have feedback,
    -- create a grading job and update the submission

    IF submission_id IS NOT NULL
    AND (
        submission_id = arg_submission_id
        OR arg_feedback IS NOT NULL
    ) THEN
        INSERT INTO grading_jobs
            (submission_id, auth_user_id,      graded_by, graded_at,
            grading_method, correct,     score,     feedback)
        VALUES
            (submission_id, arg_authn_user_id, arg_authn_user_id,     now(),
            'Manual',   new_correct, new_score, arg_feedback);

        UPDATE submissions AS s
        SET
            auth_user_id = arg_authn_user_id,
            feedback = CASE
                WHEN feedback IS NULL THEN arg_feedback
                WHEN arg_feedback IS NULL THEN feedback
                WHEN jsonb_typeof(feedback) = 'object' AND jsonb_typeof(arg_feedback) = 'object' THEN feedback || arg_feedback
                ELSE arg_feedback
            END,
            graded_at = now(),
            grading_method = 'External',
            override_score = new_score,
            score = COALESCE(new_score, score),
            correct = COALESCE(new_correct, correct)
        WHERE s.id = submission_id;
    END IF;

    -- ##################################################################
    -- do the score update of the instance_question, log it, and update the assessment_instance, if we have a new_score

    IF new_score IS NOT NULL THEN
        UPDATE instance_questions AS iq
        SET
            points = new_points,
            points_in_grading = 0,
            score_perc = new_score_perc,
            score_perc_in_grading = 0
        WHERE iq.id = instance_question_id;

        INSERT INTO question_score_logs
            (instance_question_id, auth_user_id,
            max_points,     points,     score_perc)
        VALUES
            (instance_question_id, arg_authn_user_id,
            max_points, new_points, new_score_perc);

        PERFORM assessment_instances_grade(assessment_instance_id, arg_authn_user_id, credit => 100, allow_decrease => true);
    END IF;
END;
$$ LANGUAGE plpgsql VOLATILE;
