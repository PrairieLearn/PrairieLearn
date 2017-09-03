DROP FUNCTION IF EXISTS instance_questions_points_exam(bigint,boolean);

CREATE OR REPLACE FUNCTION
    instance_questions_points_exam(
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
BEGIN
    SELECT * INTO iq FROM instance_questions WHERE id = instance_question_id;
    SELECT * INTO aq FROM assessment_questions WHERE id = iq.assessment_question_id;

    max_points := COALESCE(aq.max_points, 0);
    highest_submission_score := greatest(submission_score, coalesce(highest_submission_score, 0));

    correct := (submission_score >= 0.5);

    IF correct THEN
        open := FALSE;
        status := 'complete';
        points := coalesce(iq.points_list[1], 0); -- coalesce is just for safety
        score_perc := points / (CASE WHEN max_points > 0 THEN max_points ELSE 1 END) * 100;
        current_value := NULL;
        points_list := array[]::double precision[];
    ELSE
        IF cardinality(iq.points_list) > 1 THEN
            open := TRUE;
            status := 'incorrect';
            current_value := iq.points_list[1];
            points_list := iq.points_list[2:cardinality(iq.points_list)];
        ELSE
            open := FALSE;
            status := 'complete';
            current_value := NULL;
            points_list := array[]::double precision[];
        END IF;
        points := 0;
        score_perc := 0;
    END IF;
END;
$$ LANGUAGE plpgsql STABLE;
