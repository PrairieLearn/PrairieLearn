CREATE FUNCTION
    instance_questions_points_homework(
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
    current_auto_value double precision;
    init_auto_points double precision;
    constant_question_value boolean;
    length integer;
    var_points_old double precision;
    var_points_new double precision;

BEGIN
    SELECT * INTO iq FROM instance_questions WHERE id = instance_question_id;
    SELECT * INTO aq FROM assessment_questions WHERE id = iq.assessment_question_id;

    max_auto_points := aq.max_auto_points;
    highest_submission_score := greatest(submission_score, coalesce(iq.highest_submission_score, 0));

    open := TRUE;
    points_list := NULL;

    -- if the submission was not correct, then immediately reset current_value
    correct := (submission_score >= 1.0);
    IF NOT correct THEN
        current_value := aq.init_points;
    ELSE
        current_value := iq.current_value;
    END IF;

    current_auto_value := current_value - aq.max_manual_points;
    init_auto_points := aq.init_points - aq.max_manual_points;

    -- modify variants_points_list
    variants_points_list := iq.variants_points_list;
    length := cardinality(variants_points_list);
    var_points_old := coalesce(variants_points_list[length], 0);
    var_points_new := submission_score*current_auto_value;
    IF (length > 0) AND (var_points_old < init_auto_points) THEN
        IF (var_points_old < var_points_new) THEN
            variants_points_list[length] = var_points_new;
        END IF;
    ELSE
        variants_points_list := array_append(variants_points_list, var_points_new);
    END IF;

    -- get property that says if we should change current_value or not
    SELECT a.constant_question_value INTO constant_question_value FROM assessments AS a WHERE a.id = aq.assessment_id;

    -- if the submission was correct, increment current_value
    IF correct AND NOT constant_question_value THEN
        current_value := least(iq.current_value + aq.init_points, aq.max_points);
    END IF;

    -- points is the sum of all elements in variants_points_list (which now must be non-empty)
    length := cardinality(variants_points_list);
    auto_points := 0;
    FOR i in 1..length LOOP
        auto_points := auto_points + variants_points_list[i];
    END LOOP;
    auto_points := least(auto_points, aq.max_auto_points);

    -- status
    IF auto_points >= aq.max_auto_points AND aq.max_manual_points = 0 THEN
        status := 'complete';
    ELSIF correct AND iq.status != 'complete' THEN
        status := 'correct';
    ELSE
        -- use current status unless it's 'unanswered' or 'saved'
        status := iq.status;
        IF iq.status IN ('unanswered', 'saved') THEN
            status := 'incorrect';
        END IF;
    END IF;
END;
$$ LANGUAGE plpgsql STABLE;
