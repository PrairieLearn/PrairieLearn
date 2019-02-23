DROP FUNCTION IF EXISTS select_balanced_assessment_questions(BIGINT, INTEGER, BIGINT);
DROP FUNCTION IF EXISTS select_balanced_assessment_questions(BIGINT, INTEGER, DOUBLE PRECISION, BIGINT);

CREATE OR REPLACE FUNCTION
    select_balanced_assessment_questions(
        assessment_id_var BIGINT,
        max_iterations INTEGER,
        num_sds DOUBLE PRECISION,
        assessment_instance_id BIGINT DEFAULT NULL -- if provided, an existing assessment instance
) RETURNS TABLE (
    assessment_question_id BIGINT,
    init_points DOUBLE PRECISION,
    points_list DOUBLE PRECISION[],
    question JSONB
) AS $$
DECLARE
    iteration INTEGER;
    means DOUBLE PRECISION[];
    sds DOUBLE PRECISION[];
    keep BOOLEAN;
    aq_ids BIGINT[];
    debug_predicted_score DOUBLE PRECISION[];
BEGIN

    -- Generate assessment
    -- Check if we want to keep this assessment by calling `filter_generated_assessment`
    -- If keep=true, we are done
    -- Else repeat

    CREATE TEMP TABLE IF NOT EXISTS assessment_table (assessment_question_id BIGINT,
                                        init_points DOUBLE PRECISION,
                                        points_list DOUBLE PRECISION[],
                                        question JSONB);

    LOOP
        iteration = 0;
        IF (num_sds > 5) THEN
            RAISE EXCEPTION 'num_sds is too damn high';
        END IF;
        LOOP
            EXIT WHEN iteration = max_iterations;

            INSERT INTO
                assessment_table (assessment_question_id, init_points, points_list, question)
                SELECT
                    selected.assessment_question_id,
                    selected.init_points,
                    selected.points_list,
                    selected.question
                FROM
                    select_assessment_questions(assessment_id_var, assessment_instance_id) AS selected;

            SELECT
                array_agg(assessment_quintile_statistics.mean_score ORDER BY assessment_quintile_statistics.quintile)
            FROM
                assessment_quintile_statistics
            WHERE
                assessment_quintile_statistics.assessment_id = assessment_id_var
            INTO
                means;

            SELECT
                array_agg(assessment_quintile_statistics.score_sd ORDER BY assessment_quintile_statistics.quintile)
            FROM
                assessment_quintile_statistics
            WHERE
                assessment_quintile_statistics.assessment_id = assessment_id_var
            INTO
                sds;

            SELECT
                array_agg(assessment_table.assessment_question_id)
            FROM
                assessment_table
            INTO
                aq_ids;

            RAISE NOTICE 'Filtering generated assessment with num-sds=% and iteration=%', num_sds, iteration;
            RAISE notice 'means: %', means;
            RAISE notice 'sds: %', sds;
            ----- debugging -----
            SELECT
                array_agg(assessment_scores.predicted_score)
            FROM
                calculate_predicted_assessment_score_quintiles_flattened(aq_ids) AS assessment_scores
            INTO debug_predicted_score;
            RAISE NOTICE 'Predicted score: %', debug_predicted_score;
            ----- debugging -----

            keep = filter_generated_assessment(aq_ids, means, sds, get_domain(assessment_id_var), num_sds);
            IF (keep) THEN
                RAISE NOTICE 'Num-sds value: %', num_sds;
                RAISE NOTICE 'Iteration num: %', iteration;
                RETURN QUERY
                    SELECT
                        *
                    FROM
                        assessment_table;
                DELETE FROM assessment_table;
                RETURN;
            END IF;

            DELETE FROM assessment_table;

            iteration = iteration + 1;
        END LOOP;

        num_sds = num_sds + 0.3;
    END LOOP;

END;
$$ LANGUAGE plpgsql VOLATILE;

CREATE OR REPLACE FUNCTION
    select_balanced_assessment_questions(
        assessment_id_var BIGINT,
        max_iterations INTEGER,
        assessment_instance_id BIGINT DEFAULT NULL -- if provided, an existing assessment instance
    ) RETURNS TABLE (
        assessment_question_id BIGINT,
        init_points DOUBLE PRECISION,
        points_list DOUBLE PRECISION[],
        question JSONB
    ) AS $$
DECLARE
    num_sds DOUBLE PRECISION;
BEGIN
    SELECT
     a.num_sds
    FROM
     assessments AS a
    INTO
     num_sds;

    RETURN QUERY
        SELECT
            *
        FROM
            select_balanced_assessment_questions(assessment_id_var, max_iterations, num_sds, assessment_instance_id);
END;
$$ LANGUAGE plpgsql VOLATILE;

CREATE OR REPLACE FUNCTION
    select_balanced_assessment_questions(
        assessment_id_var BIGINT,
        assessment_instance_id BIGINT DEFAULT NULL -- if provided, an existing assessment instance
    ) RETURNS TABLE (
        assessment_question_id BIGINT,
        init_points DOUBLE PRECISION,
        points_list DOUBLE PRECISION[],
        question JSONB
    ) AS $$
DECLARE
    num_sds DOUBLE PRECISION;
BEGIN
    RETURN QUERY
        SELECT
            *
        FROM
            select_balanced_assessment_questions(assessment_id_var, 10, assessment_instance_id);
END;
$$ LANGUAGE plpgsql VOLATILE;
