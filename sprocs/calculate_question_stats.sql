CREATE OR REPLACE FUNCTION
    calculate_question_stats (
        question_id_var bigint
    ) RETURNS VOID
AS $$
BEGIN
    -- exams
    PERFORM calculate_question_stats(question_id_var, 'Exams', 'Exam', 'Exam');
    -- practice_exams
    PERFORM calculate_question_stats(question_id_var, 'PracticeExams', 'Exam', 'Public');
    -- hws
    PERFORM calculate_question_stats(question_id_var, 'HWs', 'Homework', 'Public');
END;
$$ LANGUAGE plpgsql VOLATILE;

CREATE OR REPLACE FUNCTION
    calculate_question_stats (
        question_id_var bigint,
        statistic_domain_var enum_statistic_domain,
        type_var enum_assessment_type,
        mode_var enum_mode
    ) RETURNS VOID
AS $$
BEGIN
    WITH assessment_weights AS (
        SELECT
            a.id AS assessment_id,
            count(a.id) AS weight
        FROM
            assessments AS a
            JOIN assessment_instances AS ai ON (a.id = ai.assessment_id)
        GROUP BY
            a.id
    ),
    averages_grouped_by_type_and_mode AS (
        SELECT
            weighted_avg(aq.mean_question_score, aw.weight::DOUBLE PRECISION) AS mean_question_score,
            weighted_avg(aq.question_score_variance, aw.weight::DOUBLE PRECISION) AS question_score_variance,
            weighted_avg(aq.discrimination, aw.weight::DOUBLE PRECISION) AS discrimination,
            array_weighted_avg(aq.quintile_question_scores, aw.weight::DOUBLE PRECISION) AS quintile_question_scores,
            weighted_avg(aq.some_submission_perc, aw.weight::DOUBLE PRECISION) AS some_submission_perc,
            weighted_avg(aq.some_perfect_submission_perc, aw.weight::DOUBLE PRECISION) AS some_perfect_submission_perc,
            weighted_avg(aq.some_nonzero_submission_perc, aw.weight::DOUBLE PRECISION) AS some_nonzero_submission_perc,
            weighted_avg(aq.average_first_submission_score, aw.weight::DOUBLE PRECISION) AS average_first_submission_score,
            weighted_avg(aq.first_submission_score_variance, aw.weight::DOUBLE PRECISION) AS first_submission_score_variance,
            array_weighted_avg(aq.first_submission_score_hist, aw.weight::DOUBLE PRECISION) AS first_submission_score_hist,
            weighted_avg(aq.average_last_submission_score, aw.weight::DOUBLE PRECISION) AS average_last_submission_score,
            weighted_avg(aq.last_submission_score_variance, aw.weight::DOUBLE PRECISION) AS last_submission_score_variance,
            array_weighted_avg(aq.last_submission_score_hist, aw.weight::DOUBLE PRECISION) AS last_submission_score_hist,
            weighted_avg(aq.average_max_submission_score, aw.weight::DOUBLE PRECISION) AS average_max_submission_score,
            weighted_avg(aq.max_submission_score_variance, aw.weight::DOUBLE PRECISION) AS max_submission_score_variance,
            array_weighted_avg(aq.max_submission_score_hist, aw.weight::DOUBLE PRECISION) AS max_submission_score_hist,
            weighted_avg(aq.average_average_submission_score, aw.weight::DOUBLE PRECISION) AS average_average_submission_score,
            weighted_avg(aq.average_submission_score_variance, aw.weight::DOUBLE PRECISION) AS average_submission_score_variance,
            array_weighted_avg(aq.average_submission_score_hist, aw.weight::DOUBLE PRECISION) AS average_submission_score_hist,
            array_weighted_avg(aq.submission_score_array_averages, aw.weight::DOUBLE PRECISION) AS submission_score_array_averages,
            array_weighted_avg(aq.submission_score_array_variances, aw.weight::DOUBLE PRECISION) AS submission_score_array_variances,
            array_weighted_avg(aq.incremental_submission_score_array_averages, aw.weight::DOUBLE PRECISION)
                AS incremental_submission_score_array_averages,
            array_weighted_avg(aq.incremental_submission_score_array_variances, aw.weight::DOUBLE PRECISION)
                AS incremental_submission_score_array_variances,
            array_weighted_avg(aq.incremental_submission_points_array_averages, aw.weight::DOUBLE PRECISION)
                AS incremental_submission_points_array_averages,
            array_weighted_avg(aq.incremental_submission_points_array_variances, aw.weight::DOUBLE PRECISION)
                AS incremental_submission_points_array_variances,
            weighted_avg(aq.average_number_submissions, aw.weight::DOUBLE PRECISION) AS average_number_submissions,
            weighted_avg(aq.number_submissions_variance, aw.weight::DOUBLE PRECISION) AS number_submissions_variance,
            array_weighted_avg(aq.number_submissions_hist, aw.weight::DOUBLE PRECISION) AS number_submissions_hist,
            array_weighted_avg(aq.number_submissions_hist_with_perfect_submission, aw.weight::DOUBLE PRECISION)
                AS number_submissions_hist_with_perfect_submission,
            array_weighted_avg(aq.number_submissions_hist_with_no_perfect_submission, aw.weight::DOUBLE PRECISION)
                AS number_submissions_hist_with_no_perfect_submission,
            array_weighted_avg_2d(aq.incremental_submission_score_array_quintile_averages, aw.weight::DOUBLE PRECISION)
                AS incremental_submission_score_array_quintile_averages,
            array_weighted_avg(aq.average_last_submission_score_quintiles, aw.weight::DOUBLE PRECISION)
                AS average_last_submission_score_quintiles,
            array_weighted_avg_2d(aq.incremental_submission_score_array_variance_quintiles, aw.weight::DOUBLE PRECISION)
                AS incremental_submission_score_array_variance_quintiles,
            array_weighted_avg(aq.last_submission_score_variance_quintiles, aw.weight::DOUBLE PRECISION)
                AS last_submission_score_variance_quintiles

        FROM
            assessment_questions AS aq
            JOIN assessments AS a ON (a.id = aq.assessment_id)
            JOIN assessment_weights AS aw ON (a.id = aw.assessment_id)
            JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
            JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
        WHERE
            aq.deleted_at IS NULL
            AND a.type = type_var
            AND a.mode = mode_var
            AND aq.question_id = question_id_var
    )
    INSERT INTO
        question_statistics (
            question_id,
            domain,
            mean_question_score,
            question_score_variance,
            discrimination,
            quintile_question_scores,
            some_submission_perc,
            some_perfect_submission_perc,
            some_nonzero_submission_perc,
            average_first_submission_score,
            first_submission_score_variance,
            first_submission_score_hist,
            average_last_submission_score,
            last_submission_score_variance,
            last_submission_score_hist,
            average_max_submission_score,
            max_submission_score_variance,
            max_submission_score_hist,
            average_average_submission_score,
            average_submission_score_variance,
            average_submission_score_hist,
            submission_score_array_averages,
            submission_score_array_variances,
            incremental_submission_score_array_averages,
            incremental_submission_score_array_variances,
            incremental_submission_points_array_averages,
            incremental_submission_points_array_variances,
            average_number_submissions,
            number_submissions_variance,
            number_submissions_hist,
            number_submissions_hist_with_perfect_submission,
            number_submissions_hist_with_no_perfect_submission,
            incremental_submission_score_array_quintile_averages,
            average_last_submission_score_quintiles,
            incremental_submission_score_array_variance_quintiles,
            last_submission_score_variance_quintiles
        )
            SELECT
                question_id_var,
                statistic_domain_var,
                ga.mean_question_score,
                ga.question_score_variance,
                ga.discrimination,
                ga.quintile_question_scores,
                ga.some_submission_perc,
                ga.some_perfect_submission_perc,
                ga.some_nonzero_submission_perc,
                ga.average_first_submission_score,
                ga.first_submission_score_variance,
                ga.first_submission_score_hist,
                ga.average_last_submission_score,
                ga.last_submission_score_variance,
                ga.last_submission_score_hist,
                ga.average_max_submission_score,
                ga.max_submission_score_variance,
                ga.max_submission_score_hist,
                ga.average_average_submission_score,
                ga.average_submission_score_variance,
                ga.average_submission_score_hist,
                ga.submission_score_array_averages,
                ga.submission_score_array_variances,
                ga.incremental_submission_score_array_averages,
                ga.incremental_submission_score_array_variances,
                ga.incremental_submission_points_array_averages,
                ga.incremental_submission_points_array_variances,
                ga.average_number_submissions,
                ga.number_submissions_variance,
                ga.number_submissions_hist,
                ga.number_submissions_hist_with_perfect_submission,
                ga.number_submissions_hist_with_no_perfect_submission,
                ga.incremental_submission_score_array_quintile_averages,
                ga.average_last_submission_score_quintiles,
                ga.incremental_submission_score_array_variance_quintiles,
                ga.last_submission_score_variance_quintiles
            FROM
                averages_grouped_by_type_and_mode AS ga
        ON CONFLICT (question_id, domain)
            DO UPDATE SET
            question_id=EXCLUDED.question_id,
            domain=EXCLUDED.domain,
            mean_question_score=EXCLUDED.mean_question_score,
            question_score_variance=EXCLUDED.question_score_variance,
            discrimination=EXCLUDED.discrimination,
            quintile_question_scores=EXCLUDED.quintile_question_scores,
            some_submission_perc=EXCLUDED.some_submission_perc,
            some_perfect_submission_perc=EXCLUDED.some_perfect_submission_perc,
            some_nonzero_submission_perc=EXCLUDED.some_nonzero_submission_perc,
            average_first_submission_score=EXCLUDED.average_first_submission_score,
            first_submission_score_variance=EXCLUDED.first_submission_score_variance,
            first_submission_score_hist=EXCLUDED.first_submission_score_hist,
            average_last_submission_score=EXCLUDED.average_last_submission_score,
            last_submission_score_variance=EXCLUDED.last_submission_score_variance,
            last_submission_score_hist=EXCLUDED.last_submission_score_hist,
            average_max_submission_score=EXCLUDED.average_max_submission_score,
            max_submission_score_variance=EXCLUDED.max_submission_score_variance,
            max_submission_score_hist=EXCLUDED.max_submission_score_hist,
            average_average_submission_score=EXCLUDED.average_average_submission_score,
            average_submission_score_variance=EXCLUDED.average_submission_score_variance,
            average_submission_score_hist=EXCLUDED.average_submission_score_hist,
            submission_score_array_averages=EXCLUDED.submission_score_array_averages,
            submission_score_array_variances=EXCLUDED.submission_score_array_variances,
            incremental_submission_score_array_averages=EXCLUDED.incremental_submission_score_array_averages,
            incremental_submission_score_array_variances=EXCLUDED.incremental_submission_score_array_variances,
            incremental_submission_points_array_averages=EXCLUDED.incremental_submission_points_array_averages,
            incremental_submission_points_array_variances=EXCLUDED.incremental_submission_points_array_variances,
            average_number_submissions=EXCLUDED.average_number_submissions,
            number_submissions_variance=EXCLUDED.number_submissions_variance,
            number_submissions_hist=EXCLUDED.number_submissions_hist,
            number_submissions_hist_with_perfect_submission=EXCLUDED.number_submissions_hist_with_perfect_submission,
            number_submissions_hist_with_no_perfect_submission=EXCLUDED.number_submissions_hist_with_no_perfect_submission,
            incremental_submission_score_array_quintile_averages=EXCLUDED.incremental_submission_score_array_quintile_averages,
            average_last_submission_score_quintiles=EXCLUDED.average_last_submission_score_quintiles,
            incremental_submission_score_array_variance_quintiles=EXCLUDED.incremental_submission_score_array_variance_quintiles,
            last_submission_score_variance_quintiles=EXCLUDED.last_submission_score_variance_quintiles

    WHERE EXISTS (SELECT * FROM averages_grouped_by_type_and_mode);
END;
$$ LANGUAGE plpgsql VOLATILE;
