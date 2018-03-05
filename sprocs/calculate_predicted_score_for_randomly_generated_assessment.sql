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

DROP FUNCTION IF EXISTS calculate_predicted_score_quintiles(BIGINT[], enum_statistic_domain);

CREATE OR REPLACE FUNCTION
    calculate_predicted_score_quintiles(
        IN generated_assessment_question_ids BIGINT[],
        IN domain_var enum_statistic_domain,
        OUT result DOUBLE PRECISION[]
)
AS $$
BEGIN
    WITH temp_table AS (
        SELECT
            quintiles.quintile AS quintile,
            sum(score_perc.question_score_perc) / sum(aq.max_points) AS score_perc
        FROM
            assessment_questions AS aq
            LEFT JOIN question_statistics AS qs
                ON (qs.question_id = aq.question_id AND qs.domain = domain_var)
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
            aq.id = ANY(generated_assessment_question_ids)
        GROUP BY
            quintiles.quintile
        ORDER BY
            quintiles.quintile
    ) SELECT array_agg(temp_table.score_perc) AS arr FROM temp_table INTO result;
END;
$$ LANGUAGE plpgsql VOLATILE;

DROP FUNCTION IF EXISTS get_domain(BIGINT);

CREATE OR REPLACE FUNCTION
    get_domain(
        IN assessment_id_var BIGINT,
        OUT domain enum_statistic_domain
)
AS $$
BEGIN
    SELECT
        get_domain(a.type, a.mode)
    FROM
        assessments AS a
    WHERE
        a.id = assessment_id_var
    INTO
        domain;
END;
$$ LANGUAGE plpgsql VOLATILE;

DROP FUNCTION IF EXISTS get_randomly_generated_assessment_question_ids(BIGINT);

CREATE OR REPLACE FUNCTION
    get_randomly_generated_assessment_question_ids(
        IN assessment_id_var BIGINT,
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
END;
$$ LANGUAGE plpgsql VOLATILE;

DROP FUNCTION IF EXISTS get_num_assessment_questions_in_assessment(BIGINT);

CREATE OR REPLACE FUNCTION
    get_num_assessment_questions_in_assessment(
    IN assessment_id_var BIGINT,
    OUT num_assessment_questions INTEGER
)
AS $$
BEGIN
    SELECT
        count(generated_aq.assessment_question_id)
    FROM
        select_assessment_questions(assessment_id_var) AS generated_aq
    INTO
        num_assessment_questions;
END;
$$ LANGUAGE plpgsql VOLATILE;

DROP FUNCTION IF EXISTS get_randomly_generated_assessment_question_ids_multiple_reps(BIGINT, INTEGER);

CREATE OR REPLACE FUNCTION
    get_randomly_generated_assessment_question_ids_multiple_reps(
    IN assessment_id_var BIGINT,
    IN num_reps INTEGER,
    OUT total_generated_assessment_question_ids BIGINT[][]
)
AS $$
DECLARE
    num_assessment_questions_in_an_assessment INTEGER;
    generated_assessment_question_ids BIGINT[];
BEGIN
    num_assessment_questions_in_an_assessment = get_num_assessment_questions_in_assessment(assessment_id_var);
    total_generated_assessment_question_ids = array_fill(NULL::BIGINT, ARRAY[num_reps, num_assessment_questions_in_an_assessment]);

    FOR i in 1..num_reps LOOP
        SELECT
            array_agg(generated_aq.assessment_question_id)
        FROM
            select_assessment_questions(assessment_id_var) AS generated_aq
        INTO
            generated_assessment_question_ids;

        FOR j in 1..num_assessment_questions_in_an_assessment LOOP
            total_generated_assessment_question_ids[i][j] = generated_assessment_question_ids[j];
        END LOOP;
    END LOOP;
END;
$$ LANGUAGE plpgsql VOLATILE;

DROP FUNCTION IF EXISTS get_randomly_generated_assessment_question_ids_and_calculate_predicted_score_quintiles(BIGINT);

CREATE OR REPLACE FUNCTION
    get_randomly_generated_assessment_question_ids_and_calculate_predicted_score_quintiles(
        IN assessment_id_var BIGINT,
        OUT result DOUBLE PRECISION[],
        OUT generated_assessment_question_ids BIGINT[]
    )
AS $$
BEGIN
    generated_assessment_question_ids = get_randomly_generated_assessment_question_ids(assessment_id_var);
    result = calculate_predicted_score_quintiles(generated_assessment_question_ids, get_domain(assessment_id_var));
END;
$$ LANGUAGE plpgsql VOLATILE;

DROP FUNCTION IF EXISTS calculate_predicted_score_quintiles_multiple_reps(enum_statistic_domain, BIGINT[][]);

CREATE OR REPLACE FUNCTION
    calculate_predicted_score_quintiles_multiple_reps(
    IN assessment_domain enum_statistic_domain,
    IN generated_assessment_question_ids BIGINT[][],
    OUT final_result DOUBLE PRECISION[][]
)
AS $$
DECLARE
    temp_result DOUBLE PRECISION[];
    num_reps INTEGER;
BEGIN
    num_reps = 50;
    final_result = array_fill(NULL::DOUBLE PRECISION, ARRAY[5, num_reps]);
    FOR i IN 1..num_reps LOOP
        temp_result = calculate_predicted_score_quintiles(slice(generated_assessment_question_ids, i)::BIGINT[], assessment_domain);
        FOR j in 1..5 LOOP
            final_result[j][i] = temp_result[j];
        END LOOP;
    END LOOP;
END;
$$ LANGUAGE plpgsql VOLATILE;

DROP FUNCTION IF EXISTS calculate_predicted_score_quintiles_multiple_reps(BIGINT);

CREATE OR REPLACE FUNCTION
    calculate_predicted_score_quintiles_multiple_reps(
        IN assessment_id_var BIGINT,
        OUT final_result DOUBLE PRECISION[][],
        OUT generated_assessment_question_ids BIGINT[][]
    )
AS $$
DECLARE
    temp_result RECORD;
    num_reps INTEGER;
BEGIN
    num_reps = 50;
    final_result = array_fill(NULL::DOUBLE PRECISION, ARRAY[5, num_reps]);
    FOR i IN 1..num_reps LOOP
        temp_result = get_randomly_generated_assessment_question_ids_and_calculate_predicted_score_quintiles(assessment_id_var);
        IF generated_assessment_question_ids IS NULL THEN
            generated_assessment_question_ids = array_fill(NULL::BIGINT,
                               ARRAY[num_reps, array_length(temp_result.generated_assessment_question_ids, 1)]);
        END IF;
        FOR j in 1..array_length(temp_result.generated_assessment_question_ids, 1) LOOP
            generated_assessment_question_ids[i][j] = temp_result.generated_assessment_question_ids[j];
        END LOOP;
        FOR j in 1..5 LOOP
            final_result[j][i] = temp_result.result[j];
        END LOOP;
    END LOOP;
END;
$$ LANGUAGE plpgsql VOLATILE;

DROP FUNCTION IF EXISTS filter_generated_assessment(
    BIGINT[],
    DOUBLE PRECISION[],
    DOUBLE PRECISION[],
    enum_statistic_domain,
    DOUBLE PRECISION
);

CREATE OR REPLACE FUNCTION
    filter_generated_assessment(
        IN generated_assessment_question_ids BIGINT[],
        IN means DOUBLE PRECISION[],
        IN sds DOUBLE PRECISION[],
        IN assessment_domain enum_statistic_domain,
        IN num_sds DOUBLE PRECISION,
        OUT keep BOOLEAN
    )
AS $$
DECLARE
    num_questions INTEGER;
    accepted_range_lower_bound DOUBLE PRECISION;
    accepted_range_upper_bound DOUBLE PRECISION;
    predicted_score DOUBLE PRECISION;
BEGIN
    num_questions = array_length(generated_assessment_question_ids, 1);

    keep = TRUE;

    for quintile in 1..5 LOOP
        accepted_range_lower_bound = means[quintile] - num_sds * sds[quintile];
        accepted_range_upper_bound = means[quintile] + num_sds * sds[quintile];

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
                ON (qs.question_id = aq.question_id AND qs.domain = assessment_domain)
            LEFT JOIN question_statistics AS hw_qs
                ON (hw_qs.question_id = aq.question_id AND hw_qs.domain = get_domain('Homework', 'Public'))
        WHERE
            aq.id = ANY(generated_assessment_question_ids)
        INTO predicted_score;

        predicted_score = least(1, greatest(0, predicted_score));

        -- if predicted score is between the lower bound and the upper bound for all quintiles, then we keep it. Otherwise, we throw it.
        IF predicted_score < accepted_range_lower_bound OR predicted_score > accepted_range_upper_bound THEN
            keep = FALSE;
        END IF;
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
        IN num_sds DOUBLE PRECISION,
        OUT filtered_assessment_question_ids_new BIGINT[][],
        OUT keep_array BOOLEAN[]
    )
AS $$
DECLARE
    assessment_question_ids_slice BIGINT[];
    num_reps INTEGER;
    num_questions INTEGER;
    keep BOOLEAN;
    num_assessments_kept INTEGER;
    filtered_assessment_question_ids BIGINT[][];
BEGIN
    num_reps = array_length(generated_assessment_question_ids, 1);
    num_questions = array_length(generated_assessment_question_ids, 2);
    filtered_assessment_question_ids = array_fill(NULL::BIGINT,
        ARRAY[num_reps, num_questions]);

    num_assessments_kept = 0;

    FOR i in 1..num_reps LOOP
        assessment_question_ids_slice = slice(generated_assessment_question_ids, i);
        keep = filter_generated_assessment(assessment_question_ids_slice, means, sds, assessment_type, assessment_mode, num_sds);

        keep_array = keep_array || keep;

        IF keep IS TRUE THEN
            num_assessments_kept = num_assessments_kept + 1;
            FOR j in 1..array_length(assessment_question_ids_slice, 1) LOOP
                filtered_assessment_question_ids[num_assessments_kept][j] = assessment_question_ids_slice[j];
            END LOOP;
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

DROP FUNCTION IF EXISTS calculate_quintile_stats(
    enum_statistic_domain,
    BIGINT[][]
);

CREATE OR REPLACE FUNCTION
    calculate_quintile_stats(
    assessment_domain enum_statistic_domain,
    generated_assessment_question_ids BIGINT[][]) RETURNS SETOF RECORD
AS $$
BEGIN
    RETURN QUERY WITH predicted_quintile_scores AS (
        SELECT
            slice((calculate_predicted_score_quintiles_multiple_reps(assessment_domain, generated_assessment_question_ids)), quintiles.quintile) AS predicted_quintile_scores,
            quintiles.quintile
        FROM
            generate_series(1,5) AS quintiles (quintile)
    ),
    predicted_quintile_scores_flattened AS (
        SELECT
            predicted_quintile_scores.quintile,
            unnest(predicted_quintile_scores.predicted_quintile_scores) AS predicted_quintile_score
        FROM
            predicted_quintile_scores
    ),
    quintile_stats AS (
        SELECT
            predicted_quintile_scores_flattened.quintile,
            avg(predicted_quintile_scores_flattened.predicted_quintile_score) AS mean,
            stddev_pop(predicted_quintile_scores_flattened.predicted_quintile_score) AS sd
        FROM
            predicted_quintile_scores_flattened
        GROUP BY
            predicted_quintile_scores_flattened.quintile
        ORDER BY
            predicted_quintile_scores_flattened.quintile
    ) SELECT * FROM quintile_stats;
END;
$$ LANGUAGE plpgsql VOLATILE;

DROP FUNCTION IF EXISTS get_lower_bounds(DOUBLE PRECISION[], DOUBLE PRECISION[], DOUBLE PRECISION, DOUBLE PRECISION[]);

CREATE OR REPLACE FUNCTION
    get_lower_bounds(
    IN means DOUBLE PRECISION[],
    IN sds DOUBLE PRECISION[],
    IN num_sds DOUBLE PRECISION,
    OUT lower_bounds DOUBLE PRECISION[]
)
AS $$
BEGIN
    FOR i in 1..array_length(means, 1) LOOP
        lower_bounds[i] = means[i] - num_sds * sds[i];
    END LOOP;
END;
$$ LANGUAGE plpgsql VOLATILE;

DROP FUNCTION IF EXISTS get_upper_bounds(DOUBLE PRECISION[], DOUBLE PRECISION[], DOUBLE PRECISION, DOUBLE PRECISION[]);

CREATE OR REPLACE FUNCTION
    get_upper_bounds(
    IN means DOUBLE PRECISION[],
    IN sds DOUBLE PRECISION[],
    IN num_sds DOUBLE PRECISION,
    OUT upper_bounds DOUBLE PRECISION[]
)
AS $$
BEGIN
    FOR i in 1..array_length(means, 1) LOOP
        upper_bounds[i] = means[i] + num_sds * sds[i];
    END LOOP;
END;
$$ LANGUAGE plpgsql VOLATILE;
