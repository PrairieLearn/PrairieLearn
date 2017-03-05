CREATE OR REPLACE FUNCTION
    instance_questions_points_exam(
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
        current_value := NULL;
    ELSE
        IF iq.number_attempts + 2 <= cardinality(iq.points_list) THEN
            open := TRUE;
            status := 'incorrect';
            current_value := iq.points_list[iq.number_attempts + 2];
        ELSE
            open := FALSE;
            status := 'complete';
            current_value := NULL;
        END IF;
        points := 0;
        score_perc := 0;
    END IF;
END;
$$ LANGUAGE plpgsql STABLE;
