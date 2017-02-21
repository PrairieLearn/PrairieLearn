CREATE OR REPLACE FUNCTION
    instance_question_points_homework(
        IN instance_question_id bigint,
        IN correct boolean,
        OUT open BOOLEAN,
        OUT status TEXT,
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

    max_points := COALESCE(iq.points_list[0], 0);

    IF aq.force_max_points THEN
        open := FALSE;
        status := 'complete';
        points := iq.points_list[0];
        score_perc := 100;
        current_value := NULL;
        RETURN;
    END IF;

    IF correct THEN
        open := FALSE;
        status := 'complete';
        points := iq.current_value;
        score_perc := points / (CASE WHEN aq.max_points > 0 THEN aq.max_points ELSE 1 END) * 100;
        current_value := iq.points_list[iq.number_attempts + 2];
    ELSE
        IF iq.number_attempts + 1 < cardinality(iq.points_list) THEN
            open := TRUE;
            status := 'incorrect';
        ELSE
            open := FALSE;
            status := 'complete';
        END IF;
        points := 0;
        score_perc := 0;
        current_value := NULL;
    END IF;
END;
$$ LANGUAGE plpgsql STABLE;
