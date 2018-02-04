DROP FUNCTION IF EXISTS calculate_predicted_score_for_randomly_generated_assessment(BIGINT);

CREATE OR REPLACE FUNCTION
    calculate_predicted_score_for_randomly_generated_assessment(
        assessment_id_var BIGINT
    ) RETURNS DOUBLE PRECISION
AS $$
DECLARE
    result DOUBLE PRECISION;
BEGIN
    SELECT
        sum(calculate_predicted_question_score(qs.incremental_submission_score_array_averages,
                                               hw_qs.average_last_submission_score,
                                               aq.points_list,
                                               aq.max_points) * aq.max_points / 100) / sum(aq.max_points) AS score_perc
    FROM
        select_assessment_questions(assessment_id_var) AS result
        JOIN assessment_questions AS aq ON (aq.id = result.assessment_question_id)
        JOIN assessments AS a ON (a.id = aq.assessment_id)
        LEFT JOIN question_statistics AS qs ON (qs.question_id = aq.question_id AND qs.domain = get_domain(a.type, a.mode))
        LEFT JOIN question_statistics AS hw_qs ON (hw_qs.question_id = aq.question_id AND hw_qs.domain = get_domain('Homework', 'Public'))
    WHERE
        a.id = assessment_id_var
    INTO result;

    RETURN result;
END;
$$ LANGUAGE plpgsql VOLATILE;

DROP FUNCTION IF EXISTS calculate_predicted_scores_for_randomly_generated_assessments(BIGINT);

CREATE OR REPLACE FUNCTION
    calculate_predicted_scores_for_randomly_generated_assessments(
    assessment_id_var BIGINT
) RETURNS DOUBLE PRECISION[]
AS $$
DECLARE
    result DOUBLE PRECISION[];
BEGIN
    FOR i IN 1..1000 LOOP
        result = result || calculate_predicted_score_for_randomly_generated_assessment(assessment_id_var);
    END LOOP;

    RETURN result;
END;
$$ LANGUAGE plpgsql VOLATILE;

DROP FUNCTION IF EXISTS calculate_predicted_score_quintiles_for_randomly_generated_assessment(BIGINT);

CREATE OR REPLACE FUNCTION
    calculate_predicted_score_quintiles_for_randomly_generated_assessment(
        IN assessment_id_var BIGINT,
        OUT result DOUBLE PRECISION[],
        OUT generated_assessment_question_ids BIGINT[]
    )
AS $$
BEGIN
    SELECT
        array_agg(generated_aq.assessment_question_id)
    FROM
        select_assessment_questions(assessment_id_var) AS generated_aq
    INTO
        generated_assessment_question_ids;

    WITH temp_table AS (
        SELECT
            quintiles.quintile AS quintile,
            sum(score_perc.question_score_perc) / sum(aq.max_points) AS score_perc
        FROM
            assessment_questions AS aq
            JOIN assessments AS a ON (a.id = aq.assessment_id)
            LEFT JOIN question_statistics AS qs
                ON (qs.question_id = aq.question_id AND qs.domain = get_domain(a.type, a.mode))
            LEFT JOIN question_statistics AS hw_qs
                ON (hw_qs.question_id = aq.question_id AND hw_qs.domain = get_domain('Homework', 'Public'))
            JOIN generate_series(1, 5) AS quintiles (quintile) ON TRUE
            -- pick from normal distribution with given mean and SD
            JOIN LATERAL
                normal_rand(1,
                    -- mean
                    calculate_predicted_question_score(
                        slice(qs.incremental_submission_score_array_quintile_averages, quintiles.quintile),
                        hw_qs.average_last_submission_score_quintiles[quintiles.quintile],
                        aq.points_list,
                        aq.max_points) * aq.max_points / 100,
                    -- SD
                    sqrt(
                        calculate_predicted_question_score(
                            slice(qs.incremental_submission_score_array_variance_quintiles, quintiles.quintile),
                            hw_qs.last_submission_score_variance_quintiles[quintiles.quintile],
                            aq.points_list,
                            aq.max_points) * aq.max_points / 100
                    )
                ) AS score_perc (question_score_perc) ON TRUE
        WHERE
            a.id = assessment_id_var
            AND aq.id = ANY(generated_assessment_question_ids)
        GROUP BY
            quintiles.quintile
        ORDER BY
            quintiles.quintile
    ) SELECT array_agg(temp_table.score_perc) AS arr FROM temp_table INTO result;
END;
$$ LANGUAGE plpgsql VOLATILE;

DROP FUNCTION IF EXISTS calculate_predicted_score_quintiles(BIGINT);

CREATE OR REPLACE FUNCTION
    calculate_predicted_score_quintiles(
        IN assessment_id_var BIGINT,
        OUT final_result DOUBLE PRECISION[][],
        OUT generated_assessment_question_ids BIGINT[][]
    )
AS $$
DECLARE
    temp_result RECORD;
    with_random_variation DOUBLE PRECISION;
    num_reps INTEGER;
BEGIN
    num_reps = 10;
    final_result = array_fill(NULL::DOUBLE PRECISION, ARRAY[5, num_reps]);
    FOR i IN 1..num_reps LOOP
        temp_result = calculate_predicted_score_quintiles_for_randomly_generated_assessment(assessment_id_var);
        IF generated_assessment_question_ids IS NULL THEN
            generated_assessment_question_ids = array_fill(NULL::BIGINT,
                               ARRAY[num_reps, array_length(temp_result.generated_assessment_question_ids, 1)]);
        END IF;
        FOR j in 1..array_length(temp_result.generated_assessment_question_ids, 1) LOOP
            generated_assessment_question_ids[i][j] = temp_result.generated_assessment_question_ids[j];
        END LOOP;
        FOR j in 1..5 LOOP
            SELECT temp_result.result[j] INTO with_random_variation;
            final_result[j][i] = least(with_random_variation, 1);
            final_result[j][i] = greatest(final_result[j][i], 0);
        END LOOP;
    END LOOP;
END;
$$ LANGUAGE plpgsql VOLATILE;

DROP FUNCTION IF EXISTS filter_generated_assessments(
    BIGINT[][],
    DOUBLE PRECISION[],
    DOUBLE PRECISION[],
    enum_assessment_type,
    enum_mode
);

CREATE OR REPLACE FUNCTION
    filter_generated_assessments(
        IN generated_assessment_question_ids BIGINT[][],
        IN means DOUBLE PRECISION[],
        IN sds DOUBLE PRECISION[],
        IN assessment_type enum_assessment_type,
        IN assessment_mode enum_mode,
        OUT filtered_assessment_question_ids_new BIGINT[][]
    )
AS $$
DECLARE
    assessment_question_ids_slice BIGINT[];
    num_reps INTEGER;
    num_questions INTEGER;
    minus_1_sd DOUBLE PRECISION;
    plus_1_sd DOUBLE PRECISION;
    predicted_score DOUBLE PRECISION;
    keep BOOLEAN;
    num_assessments_kept INTEGER;
    filtered_assessment_question_ids BIGINT[][];
BEGIN
    num_reps = array_length(generated_assessment_question_ids, 1);
    num_questions = array_length(generated_assessment_question_ids, 2);
    filtered_assessment_question_ids = array_fill(NULL::BIGINT,
        ARRAY[num_reps, num_questions]);

    num_assessments_kept = 1;

    FOR i in 1..num_reps LOOP
        assessment_question_ids_slice = slice(generated_assessment_question_ids, i);
        keep = TRUE;

        for quintile in 1..5 LOOP
            minus_1_sd = means[quintile] - sds[quintile];
            plus_1_sd = means[quintile] + sds[quintile];

            SELECT
                sum(
                    calculate_predicted_question_score(
                        slice(qs.incremental_submission_score_array_quintile_averages, quintile),
                        hw_qs.average_last_submission_score_quintiles[quintile],
                        aq.points_list,
                        aq.max_points) * aq.max_points / 100
                ) / sum(aq.max_points) AS score_perc
            FROM
                assessment_questions AS aq
                LEFT JOIN question_statistics AS qs
                    ON (qs.question_id = aq.question_id AND qs.domain = get_domain(assessment_type, assessment_mode))
                LEFT JOIN question_statistics AS hw_qs
                    ON (hw_qs.question_id = aq.question_id AND hw_qs.domain = get_domain('Homework', 'Public'))
            WHERE
                aq.id = ANY(assessment_question_ids_slice)
            INTO predicted_score;

            IF predicted_score > 1 THEN
                RAISE NOTICE 'MORE THAN 1!';
                RAISE NOTICE 'Quintile: %', quintile;
                RAISE NOTICE 'Predicted score: %', predicted_score;
                RAISE NOTICE 'AQ ids: %', assessment_question_ids_slice;
                RAISE NOTICE 'A type: %', assessment_type;
                RAISE NOTICE 'A mode: %', assessment_mode;
            END IF;

            RAISE NOTICE 'Predicted score: %', predicted_score;
            RAISE NOTICE 'Quintile: %', quintile;

            -- if predicted score is between minus_1_sd and plus_1_sd for all quintiles, then we keep it. Otherwise, we throw it.
            IF predicted_score < minus_1_sd OR predicted_score > plus_1_sd THEN
                keep = FALSE;
                RAISE NOTICE 'Predicted score: % ; -1 SD: % ; +1 SD: %', predicted_score, minus_1_sd, plus_1_sd;
                RAISE NOTICE 'KEEP FALSE';
            END IF;
        END LOOP;

        IF keep IS TRUE THEN
            FOR j in 1..array_length(assessment_question_ids_slice, 1) LOOP
                filtered_assessment_question_ids[num_assessments_kept][j] = assessment_question_ids_slice[j];
            END LOOP;
            num_assessments_kept = num_assessments_kept + 1;
        END IF;
    END LOOP;

    filtered_assessment_question_ids_new = array_fill(NULL::BIGINT, ARRAY[num_assessments_kept, num_questions]);

    FOR i in 1..num_assessments_kept LOOP
        FOR j in 1..num_questions LOOP
            filtered_assessment_question_ids_new[i][j] = filtered_assessment_question_ids[i][j];
        END LOOP;
    END LOOP;
END;
$$ LANGUAGE plpgsql VOLATILE;

