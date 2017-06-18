CREATE OR REPLACE FUNCTION
    filter_generated_assessment(
        IN generated_assessment_question_ids BIGINT[],
        IN means DOUBLE PRECISION[],
        IN sds DOUBLE PRECISION[],
        IN assessment_domain enum_statistic_domain,
        IN num_sds DOUBLE PRECISION,
        IN disqualification_threshold INTEGER,
        OUT keep BOOLEAN
    )
AS $$
DECLARE
    num_questions INTEGER;
    accepted_range_lower_bound DOUBLE PRECISION;
    accepted_range_upper_bound DOUBLE PRECISION;
    predicted_assessment_score DOUBLE PRECISION;
    num_disqualified INTEGER;
BEGIN
    num_questions = array_length(generated_assessment_question_ids, 1);

    keep = TRUE;
    num_disqualified = 0;


    for quintile in 1..5 LOOP
        accepted_range_lower_bound = means[quintile] - num_sds * sds[quintile];
        accepted_range_upper_bound = means[quintile] + num_sds * sds[quintile];

        RAISE NOTICE 'generated_assessment_question_ids: %', generated_assessment_question_ids;
        RAISE NOTICE 'Quintile: %', quintile;
        RAISE NOTICE 'Lower bound: %', accepted_range_lower_bound;
        RAISE NOTICE 'Upper bound: %', accepted_range_upper_bound;
        RAISE NOTICE 'Means: %', means;
        RAISE NOTICE 'Sds: %', sds;

        SELECT
            sum(
                calculate_predicted_question_points(
                    slice(qs.incremental_submission_score_array_quintile_averages, quintile),
                    hw_qs.average_last_submission_score_quintiles[quintile],
                    aq.points_list,
                    aq.max_points)
            ) / sum(aq.max_points) AS predicted_assessment_score
        FROM
            assessment_questions AS aq
            LEFT JOIN question_statistics AS qs
                ON (qs.question_id = aq.question_id AND qs.domain = assessment_domain)
            LEFT JOIN question_statistics AS hw_qs
                ON (hw_qs.question_id = aq.question_id AND hw_qs.domain = get_domain('Homework', 'Public'))
        WHERE
            aq.id = ANY(generated_assessment_question_ids)
        INTO predicted_assessment_score;

        predicted_assessment_score = least(1, greatest(0, predicted_assessment_score));

        RAISE NOTICE 'Predicted score: %', predicted_assessment_score;

        -- if predicted score is between the lower bound and the upper bound for all quintiles, then we keep it. Otherwise, we throw it.
        IF predicted_assessment_score < accepted_range_lower_bound OR predicted_assessment_score > accepted_range_upper_bound THEN
            RAISE NOTICE 'DISQUALIFIED';
            num_disqualified = num_disqualified + 1;
        END IF;
    END LOOP;

    IF num_disqualified > disqualification_threshold THEN
        keep = FALSE;
    END IF;
END;
$$ LANGUAGE plpgsql VOLATILE;

