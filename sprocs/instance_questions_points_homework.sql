CREATE OR REPLACE FUNCTION
    instance_questions_points_homework(
        IN instance_question_id bigint,
        IN correct boolean,
        OUT open BOOLEAN,
        OUT status enum_instance_question_status,
        OUT points DOUBLE PRECISION,
        OUT score_perc DOUBLE PRECISION,
        OUT current_value DOUBLE PRECISION,
        OUT max_points DOUBLE PRECISION
    )
AS $$
DECLARE
    iq instance_questions%ROWTYPE;
    aq assessment_questions%ROWTYPE;
BEGIN
    SELECT *
    INTO iq
    FROM instance_questions
    WHERE id = instance_question_id;

    SELECT *
    INTO aq
    FROM assessment_questions
    WHERE id = iq.assessment_question_id;

    max_points := aq.max_points;

    open := TRUE;

    IF aq.force_max_points THEN
        points := aq.max_points;
        score_perc := 100;
        current_value := aq.max_points;
        status := 'correct';
        RETURN;
    END IF;

    IF correct THEN
        points := least(iq.points + iq.current_value, aq.max_points);
        score_perc := points / (CASE WHEN aq.max_points > 0 THEN aq.max_points ELSE 1 END) * 100;
        current_value := least(iq.current_value + aq.init_points, aq.max_points);
        status := 'correct';
    ELSE
        points := iq.points;
        score_perc := iq.score_perc;
        current_value := aq.init_points;

        -- use current status unless it's 'unanswered'
        status := iq.status;
        IF iq.status = 'unanswered' THEN
            status := 'incorrect';
        END IF;
    END IF;
END;
$$ LANGUAGE plpgsql STABLE;
