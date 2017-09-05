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
        OUT variants_points_list DOUBLE PRECISION[],
        OUT max_points DOUBLE PRECISION
    )
AS $$
DECLARE
    iq instance_questions%ROWTYPE;
    aq assessment_questions%ROWTYPE;
    correct boolean;
    constant_question_value boolean;
    length integer;
    var_points_old double precision;
    var_points_new double precision;

BEGIN
    SELECT * INTO iq FROM instance_questions WHERE id = instance_question_id;
    SELECT * INTO aq FROM assessment_questions WHERE id = iq.assessment_question_id;

    max_points := aq.max_points;
    highest_submission_score := greatest(submission_score, coalesce(highest_submission_score, 0));

    open := TRUE;
    points_list := NULL;

    -- variants_points_list := iq.variants_points_list;

    -- if variants_points_list has cardinality > 0
    -- if variants_points_list[end] < value

    -- if score is 1
    --     if end of variants_points_list is non-empty and less than init_points
    --         replace end of variants_points_list with value (which will be init_points)
    --     else
    --         append value to end of variants_points_list
    -- ELSE
    --     if end of variants_points_list is non-empty and less than init_points
    --         if (score*value) is greater than end of variants_points_list
    --             replace end with score*value
    --         else do nothing
    --     else append (score*value) to end

    -- All of this can be reduced to:
    --
    -- if (score < 1) set current_value to init_points
    -- if variants_points_list is non-empty and end is less than init_points
    --     replace end with greater of it and score*current_value
    -- else
    --     append score*current_value to end of variants_points_list

    -- if the submission was not correct, then immediately reset current_value
    correct := (submission_score >= 1.0);
    IF NOT correct THEN
        current_value := aq.init_points;
    ELSE
        current_value := iq.current_value;
    END IF;

    -- modify variants_points_list
    variants_points_list := iq.variants_points_list;
    length := cardinality(variants_points_list);
    var_points_old := coalesce(variants_points_list[length], 0);
    var_points_new := submission_score*current_value;
    IF (length > 0) AND (var_points_old < least(aq.init_points, var_points_new)) THEN
        variants_points_list[length] = var_points_new;
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
    points := 0;
    FOR i in 1..length LOOP
        points := points + variants_points_list[i];
    END LOOP;
    points := least(points, aq.max_points);

    -- score_perc
    score_perc := points / (CASE WHEN aq.max_points > 0 THEN aq.max_points ELSE 1 END) * 100;

    -- status
    IF correct THEN
        status := 'correct';
    ELSE
        -- use current status unless it's 'unanswered'
        status := iq.status;
        IF iq.status = 'unanswered' THEN
            status := 'incorrect';
        END IF;
    END IF;

    -- Still need to compute:
    --      points
    --      score_perc
    --      status





    -- IF (cardinality(variants_points_list) > 0) THEN
    --     IF (variants_points_list[cardinality(variants_points_list)] < aq.init_points) THEN
    --         IF (variants_points_list[cardinality(variants_points_list)] < (submission_score*current_value)) THEN
    --             variants_points_list[cardinality(variants_points_list)] := submission_score*current_value
    --         END IF;
    --     END IF;
    -- ELSE
    --     array_append(variants_points_list,submission_score*current_value)
    -- END IF;




    -- -- get property that says if we should change current_value or not
    -- SELECT a.constant_question_value INTO constant_question_value FROM assessments AS a WHERE a.id = aq.assessment_id;
    --
    -- correct := (submission_score >= 0.5);
    --
    -- IF correct THEN
    --     points := least(iq.points + iq.current_value, aq.max_points);
    --     score_perc := points / (CASE WHEN aq.max_points > 0 THEN aq.max_points ELSE 1 END) * 100;
    --
    --     IF NOT constant_question_value THEN
    --         current_value := least(iq.current_value + aq.init_points, aq.max_points);
    --     ELSE
    --         current_value := iq.current_value;
    --     END IF;
    --
    --     status := 'correct';
    -- ELSE
    --     points := iq.points;
    --     score_perc := iq.score_perc;
    --
    --     IF NOT constant_question_value THEN
    --         current_value := aq.init_points;
    --     ELSE
    --         current_value := iq.current_value;
    --     END IF;
    --
    --     -- use current status unless it's 'unanswered'
    --     status := iq.status;
    --     IF iq.status = 'unanswered' THEN
    --         status := 'incorrect';
    --     END IF;
    -- END IF;
END;
$$ LANGUAGE plpgsql STABLE;
