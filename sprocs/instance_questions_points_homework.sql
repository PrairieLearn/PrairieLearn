DROP FUNCTION IF EXISTS instance_questions_points_homework(bigint,boolean);

CREATE OR REPLACE FUNCTION
    instance_questions_points_homework(
        IN instance_question_id bigint,
        IN submission_score DOUBLE PRECISION,
        OUT open BOOLEAN,
        OUT status enum_instance_question_status,
        OUT points DOUBLE PRECISION,
        OUT score_perc DOUBLE PRECISION,
        OUT highest_submission_score DOUBLE PRECISION,
        OUT current_value DOUBLE PRECISION,
        OUT points_list DOUBLE PRECISION[],
        OUT max_points DOUBLE PRECISION
    )
AS $$
DECLARE
    iq instance_questions%ROWTYPE;
    aq assessment_questions%ROWTYPE;
    correct boolean;
    constant_question_value boolean;
BEGIN
    SELECT * INTO iq FROM instance_questions WHERE id = instance_question_id;
    SELECT * INTO aq FROM assessment_questions WHERE id = iq.assessment_question_id;

    max_points := aq.max_points;
    highest_submission_score := greatest(submission_score, coalesce(highest_submission_score, 0));

    open := TRUE;
    points_list := NULL;

    -- get property that says if we should change current_value or not
    SELECT a.constant_question_value INTO constant_question_value FROM assessments AS a WHERE a.id = aq.assessment_id;

    correct := (submission_score >= 0.5);

    IF correct THEN
        points := least(iq.points + iq.current_value, aq.max_points);
        score_perc := points / (CASE WHEN aq.max_points > 0 THEN aq.max_points ELSE 1 END) * 100;

        IF NOT constant_question_value THEN
            current_value := least(iq.current_value + aq.init_points, aq.max_points);
        ELSE
            current_value := iq.current_value;
        END IF;

        status := 'correct';
    ELSE
        points := iq.points;
        score_perc := iq.score_perc;

        IF NOT constant_question_value THEN
            current_value := aq.init_points;
        ELSE
            current_value := iq.current_value;
        END IF;

        -- use current status unless it's 'unanswered'
        status := iq.status;
        IF iq.status = 'unanswered' THEN
            status := 'incorrect';
        END IF;
    END IF;
END;
$$ LANGUAGE plpgsql STABLE;
