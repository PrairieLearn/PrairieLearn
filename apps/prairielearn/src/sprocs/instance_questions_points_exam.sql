CREATE FUNCTION
    instance_questions_points_exam(
        IN instance_question_id bigint,
        IN submission_score DOUBLE PRECISION,
        OUT open BOOLEAN,
        OUT status enum_instance_question_status,
        OUT auto_points DOUBLE PRECISION,
        OUT highest_submission_score DOUBLE PRECISION,
        OUT current_value DOUBLE PRECISION,
        OUT points_list DOUBLE PRECISION[],
        OUT variants_points_list DOUBLE PRECISION[],
        OUT max_auto_points DOUBLE PRECISION
    )
AS $$
DECLARE
    iq instance_questions%ROWTYPE;
    aq assessment_questions%ROWTYPE;
    correct boolean;
    max_manual_points double precision;
BEGIN
    SELECT * INTO iq FROM instance_questions WHERE id = instance_question_id;
    SELECT * INTO aq FROM assessment_questions WHERE id = iq.assessment_question_id;

    -- exams don't use this, so just copy whatever was there before
    variants_points_list := iq.variants_points_list;

    max_auto_points := COALESCE(aq.max_auto_points, 0);
    max_manual_points := COALESCE(aq.max_manual_points, 0);

    -- Update points (instance_question will be closed when number_attempts exceeds bound,
    -- so we don't have to worry about accessing a non-existent entry in points_list_original,
    -- but use coalesce just to be safe)
    auto_points := COALESCE(iq.auto_points, iq.points) +
                   (iq.points_list_original[iq.number_attempts + 1] - max_manual_points) *
                   GREATEST(0, submission_score - coalesce(iq.highest_submission_score, 0));

    -- Handle the special case in which points_list is constant (e.g., [10 10 10 10])
    IF (submission_score >= 1) AND (iq.points_list_original[iq.number_attempts + 1] - max_manual_points = max_auto_points) THEN
        auto_points := max_auto_points;
    END IF;

    highest_submission_score := GREATEST(submission_score, coalesce(iq.highest_submission_score, 0));
    correct := (submission_score >= 1.0);

    -- Decide if done or not and update points_list. If the answer is
    -- correct, additional submissions are allowed only if there are
    -- manual points, since students may wish to submit a new version
    -- that has better potential for manual grading, but only if the
    -- points list has attempts left.
    IF (correct AND max_manual_points = 0) OR cardinality(iq.points_list) <= 1 THEN
        open := FALSE;
        status := 'complete';
        current_value := NULL;
        points_list := array[]::double precision[];
    ELSE
        open := TRUE;
        status := CASE WHEN correct THEN 'correct' ELSE 'incorrect' END;
        current_value := iq.points_list[1];
        points_list := array[]::double precision[];
        FOR i in 1..(cardinality(iq.points_list_original)-(iq.number_attempts+1)) LOOP
            points_list[i] := (iq.points_list_original[iq.number_attempts+i+1] - max_manual_points) * (1 - highest_submission_score) + max_manual_points;
        END LOOP;
    END IF;
END;
$$ LANGUAGE plpgsql STABLE;
