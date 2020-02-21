DROP FUNCTION IF EXISTS instance_questions_update_score(bigint,double precision,double precision,bigint,jsonb,bigint);

CREATE OR REPLACE FUNCTION
    instance_questions_update_score(
        IN instance_question_id bigint,
        IN set_score_perc double precision, -- either set_score_perc or set_points must be non-NULL
        IN set_points double precision,
        IN given_submission_id bigint, -- if NULL, use the most recent submission
        IN set_feedback jsonb,
        IN authn_user_id bigint
    ) RETURNS void
AS $$
DECLARE
    assessment_instance_id bigint;
    submission_id bigint;
    max_points double precision;
    new_score_perc double precision;
    new_points double precision;
    new_score double precision;
    new_correct boolean;
BEGIN
    -- ##################################################################
    -- get the assessment_instance information

    SELECT                ai.id, aq.max_points
    INTO assessment_instance_id,    max_points
    FROM
        instance_questions AS iq
        JOIN assessment_instances AS ai ON (ai.id = iq.assessment_instance_id)
        JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
    WHERE iq.id = instance_question_id;

    IF NOT FOUND THEN RAISE EXCEPTION 'no such instance_question_id: %', instance_question_id; END IF;

    -- ##################################################################
    -- compute the new score_perc/points

    max_points := COALESCE(max_points, 0);

    IF set_score_perc IS NOT NULL THEN
        IF set_points IS NOT NULL THEN RAISE EXCEPTION 'Cannot set both score_perc and points'; END IF;
        new_score_perc := set_score_perc;
        new_points := new_score_perc / 100 * max_points;
    ELSIF set_points IS NOT NULL THEN
        new_points := set_points;
        new_score_perc := new_points / (CASE WHEN max_points > 0 THEN max_points ELSE 1 END) * 100;
    ELSE
        RAISE EXCEPTION 'Must set either score_perc or points';
    END IF;

    new_score := new_score_perc / 100;
    new_correct := (new_score > 0.5);

    -- ##################################################################
    -- look up the most recent submission_id if necessary

    submission_id := given_submission_id;

    IF (submission_id IS NULL) AND (set_feedback IS NOT NULL) THEN
        SELECT s.id
        INTO submission_id
        FROM
            submissions AS s
            JOIN variants AS v ON (v.id = s.variant_id)
        WHERE v.instance_question_id = instance_questions_update_score.instance_question_id
        ORDER BY s.date DESC;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'No submissions found for instance_question_id = %, cannot set feedback', instance_question_id;
        END IF;
    END IF;

    -- ##################################################################
    -- update the submission and grading if we have a submission_id

    IF submission_id IS NOT NULL THEN
        -- make sure the submission belongs to the instance_question
        PERFORM *
        FROM
            submissions AS s
            JOIN variants AS v ON (v.id = s.variant_id)
        WHERE
            s.id = submission_id
            AND v.instance_question_id = instance_questions_update_score.instance_question_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'submission_id = % not found for instance_question_id = %', submission_id, instance_question_id;
        END IF;

        INSERT INTO grading_jobs
            (submission_id, auth_user_id,      graded_by, graded_at,
            grading_method, correct,     score,     feedback)
        VALUES
            (submission_id, authn_user_id, authn_user_id,     now(),
            'Manual',   new_correct, new_score, set_feedback);

        UPDATE submissions AS s
        SET
            auth_user_id = instance_questions_update_score.authn_user_id,
            feedback = CASE
                WHEN feedback IS NULL THEN set_feedback
                WHEN set_feedback IS NULL THEN feedback
                WHEN jsonb_typeof(feedback) = 'object' AND jsonb_typeof(set_feedback) = 'object' THEN feedback || set_feedback
                ELSE set_feedback
            END,
            graded_at = now(),
            grading_method = 'Manual',
            override_score = new_score,
            score = new_score,
            correct = new_correct
        WHERE s.id = submission_id;
    END IF;

    -- ##################################################################
    -- do the score update of the instance_question and log it

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
        (instance_question_id, authn_user_id,
        max_points, new_points, new_score_perc);

    -- ##################################################################
    -- recompute the assessment_instance score

    PERFORM assessment_instances_grade(assessment_instance_id, authn_user_id, credit => 100, allow_decrease => true);
END;
$$ LANGUAGE plpgsql VOLATILE;
