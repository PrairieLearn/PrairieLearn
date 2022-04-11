CREATE FUNCTION
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
        OUT variants_points_list DOUBLE PRECISION[],
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

    -- exams don't use this, so just copy whatever was there before
    variants_points_list := iq.variants_points_list;

    max_points := COALESCE(aq.max_points, 0);

    -- Update points (instance_question will be closed when number_attempts exceeds bound,
    -- so we don't have to worry about accessing a non-existent entry in points_list_original,
    -- but use coalesce just to be safe)
    points := iq.points + iq.points_list_original[iq.number_attempts + 1] * GREATEST(0, submission_score - coalesce(iq.highest_submission_score, 0));

    -- Handle the special case in which points_list is constant (e.g., [10 10 10 10])
    IF (submission_score >= 1) AND (iq.points_list_original[iq.number_attempts + 1] = max_points) THEN
        points := max_points;
    END IF;

    -- Update score_perc
    score_perc := points / (CASE WHEN max_points > 0 THEN max_points ELSE 1 END) * 100;

    -- Update highest_submission_score
    highest_submission_score := GREATEST(submission_score, coalesce(iq.highest_submission_score, 0));

    -- Decide if done or not and update points_list
    correct := (submission_score >= 1.0);
    IF correct THEN
        open := FALSE;
        status := 'complete';
        current_value := NULL;
        points_list := array[]::double precision[];
    ELSE
        IF cardinality(iq.points_list) > 1 THEN
            open := TRUE;
            status := 'incorrect';
            current_value := iq.points_list[1];
            points_list := array[]::double precision[];
            FOR i in 1..(cardinality(iq.points_list_original)-(iq.number_attempts+1)) LOOP
                points_list[i] := iq.points_list_original[iq.number_attempts+i+1] * (1 - highest_submission_score);
            END LOOP;
        ELSE
            open := FALSE;
            status := 'complete';
            current_value := NULL;
            points_list := array[]::double precision[];
        END IF;
    END IF;
END;
$$ LANGUAGE plpgsql STABLE;
