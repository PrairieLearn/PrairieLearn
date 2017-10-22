CREATE OR REPLACE FUNCTION
    assessment_questions_calculate_stats (
        assessment_question_id_param bigint
    ) RETURNS VOID
AS $$
BEGIN
    WITH more_info AS (
        SELECT
            aq.assessment_id,
            aq.question_id,
            a.course_instance_id,
            aq.id AS assessment_question_id
        FROM
            assessment_questions AS aq
            JOIN assessments AS a ON (a.id = aq.assessment_id)
        WHERE
            aq.id = assessment_question_id_param
    ),
    user_roles AS (
        SELECT
            u.user_id,
            e.role
        FROM
            users AS u
            JOIN more_info ON TRUE
            JOIN enrollments AS e ON (e.user_id = u.user_id AND e.course_instance_id = more_info.course_instance_id)
    ),
    relevant_assessment_instances AS (
        SELECT
            ai.*
        FROM
            assessment_instances AS ai
            JOIN user_roles ON user_roles.user_id = ai.user_id
            JOIN more_info ON TRUE
        WHERE
            ai.assessment_id = more_info.assessment_id
            AND user_roles.role = 'Student'
    ),
    relevant_instance_questions AS (
        SELECT
            iq.*
        FROM
            instance_questions AS iq
            JOIN more_info ON TRUE
            JOIN assessment_instances AS ai ON (iq.assessment_instance_id = ai.id)
            JOIN user_roles ON user_roles.user_id = ai.user_id
        WHERE
            iq.assessment_question_id = more_info.assessment_question_id
            AND user_roles.role = 'Student'
    ),
    relevant_users AS (
        SELECT
            u.*
        FROM
            relevant_assessment_instances AS ai
            JOIN users AS u ON (ai.user_id = u.user_id)
        GROUP BY
            u.user_id
    ),
    question_scores_by_user AS (
        SELECT
            ai.user_id,
            avg(iq.score_perc) AS user_score_perc
        FROM
            relevant_instance_questions AS iq
            JOIN assessment_instances AS ai ON (iq.assessment_instance_id = ai.id)
        GROUP BY
            ai.user_id
    ),
    assessment_scores_by_user AS (
        SELECT
            ai.user_id,
            max(ai.score_perc) AS user_score_perc
        FROM
            relevant_assessment_instances AS ai
        GROUP BY
            ai.user_id
    ),
    user_quintiles AS (
        SELECT
            assessment_scores_by_user.user_id,
            ntile(5) OVER (
                ORDER BY assessment_scores_by_user.user_score_perc
            ) as quintile
        FROM
            assessment_scores_by_user
    ),
    quintile_scores AS (
        SELECT
            avg(question_scores_by_user.user_score_perc) AS quintile_score
        FROM
            question_scores_by_user
            JOIN user_quintiles ON (user_quintiles.user_id = question_scores_by_user.user_id)
        GROUP BY
            user_quintiles.quintile
        ORDER BY
            user_quintiles.quintile
    ),
    quintile_scores_as_array AS (
        SELECT array_agg(quintile_scores.quintile_score) AS quintile_scores
        FROM
            quintile_scores
    ),
    instance_question_stats_by_user AS (
        SELECT
            ai.user_id,
            avg(iq.score_perc) AS user_score_perc,
            100 * count(iq.id) FILTER (WHERE iq.some_submission = TRUE) / count(iq.id) AS some_submission_perc,
            100 * count(iq.id) FILTER (WHERE iq.some_perfect_submission = TRUE) / count(iq.id) AS some_perfect_submission_perc,
            100 * count(iq.id) FILTER (WHERE iq.some_nonzero_submission = TRUE) / count(iq.id) AS some_nonzero_submission_perc,
            avg(iq.first_submission_score) AS first_submission_score,
            avg(iq.last_submission_score) AS last_submission_score,
            avg(iq.max_submission_score) AS max_submission_score,
            avg(iq.average_submission_score) AS average_submission_score,
            array_avg(iq.submission_score_array) AS submission_score_array,
            array_avg(iq.incremental_submission_score_array) AS incremental_submission_score_array,
            array_avg(iq.incremental_submission_points_array) AS incremental_submission_points_array,
            avg(iq.number_attempts) AS number_submissions
        FROM
            relevant_instance_questions AS iq
            JOIN assessment_instances AS ai ON (iq.assessment_instance_id = ai.id)
        GROUP BY
            ai.user_id
    ),
    aq_stats AS (
        SELECT
            greatest(0, least(100, avg(iq_stats_by_user.user_score_perc))) AS mean_question_score,
            sqrt(var_pop(iq_stats_by_user.user_score_perc)) AS question_score_variance,
            greatest(0, least(100, corr(question_scores_by_user.user_score_perc, assessment_scores_by_user.user_score_perc) * 100.0)) as discrimination,
            avg(iq_stats_by_user.some_submission_perc) AS some_submission_perc,
            avg(iq_stats_by_user.some_perfect_submission_perc) AS some_perfect_submission_perc,
            avg(iq_stats_by_user.some_nonzero_submission_perc) AS some_nonzero_submission_perc,
            avg(iq_stats_by_user.first_submission_score) AS average_first_submission_score,
            sqrt(var_pop(iq_stats_by_user.first_submission_score)) AS first_submission_score_variance,
            histogram(iq_stats_by_user.first_submission_score, 0, 1, 10) AS first_submission_score_hist,
            avg(iq_stats_by_user.last_submission_score) AS average_last_submission_score,
            sqrt(var_pop(iq_stats_by_user.last_submission_score)) AS last_submission_score_variance,
            histogram(iq_stats_by_user.last_submission_score, 0, 1, 10) AS last_submission_score_hist,
            avg(iq_stats_by_user.max_submission_score) AS average_max_submission_score,
            sqrt(var_pop(iq_stats_by_user.max_submission_score)) AS max_submission_score_variance,
            histogram(iq_stats_by_user.max_submission_score, 0, 1, 10) AS max_submission_score_hist,
            avg(iq_stats_by_user.average_submission_score) AS average_average_submission_score,
            sqrt(var_pop(iq_stats_by_user.average_submission_score)) AS average_submission_score_variance,
            histogram(iq_stats_by_user.average_submission_score, 0, 1, 10) AS average_submission_score_hist,
            array_avg(iq_stats_by_user.submission_score_array) AS submission_score_array_averages,
            array_var(iq_stats_by_user.submission_score_array) AS submission_score_array_variances,
            array_avg(iq_stats_by_user.incremental_submission_score_array) AS incremental_submission_score_array_averages,
            array_var(iq_stats_by_user.incremental_submission_score_array) AS incremental_submission_score_array_variances,
            array_avg(iq_stats_by_user.incremental_submission_points_array) AS incremental_submission_points_array_averages,
            array_var(iq_stats_by_user.incremental_submission_points_array) AS incremental_submission_points_array_variances,
            avg(iq_stats_by_user.number_submissions) AS average_number_submissions,
            var_pop(iq_stats_by_user.number_submissions) AS number_submissions_variance,
            histogram(iq_stats_by_user.number_submissions, 0, 10, 10) AS number_submissions_hist
        FROM
            relevant_users AS u
            JOIN question_scores_by_user ON (question_scores_by_user.user_id = u.user_id)
            JOIN assessment_scores_by_user ON (assessment_scores_by_user.user_id = u.user_id)
            JOIN instance_question_stats_by_user AS iq_stats_by_user ON (iq_stats_by_user.user_id = u.user_id)
    )
    UPDATE
        assessment_questions AS aq
    SET
        mean_question_score = aq_stats.mean_question_score,
        question_score_variance = aq_stats.question_score_variance,
        discrimination = aq_stats.discrimination,
        quintile_question_scores = quintile_scores_as_array.quintile_scores,
        some_submission_perc = aq_stats.some_submission_perc,
        some_perfect_submission_perc = aq_stats.some_perfect_submission_perc,
        some_nonzero_submission_perc = aq_stats.some_nonzero_submission_perc,
        average_first_submission_score = aq_stats.average_first_submission_score,
        first_submission_score_variance = aq_stats.first_submission_score_variance,
        first_submission_score_hist = aq_stats.first_submission_score_hist,
        average_last_submission_score = aq_stats.average_last_submission_score,
        last_submission_score_variance = aq_stats.last_submission_score_variance,
        last_submission_score_hist = aq_stats.last_submission_score_hist,
        average_max_submission_score = aq_stats.average_max_submission_score,
        max_submission_score_variance = aq_stats.max_submission_score_variance,
        max_submission_score_hist = aq_stats.max_submission_score_hist,
        average_average_submission_score = aq_stats.average_average_submission_score,
        average_submission_score_variance = aq_stats.average_submission_score_variance,
        average_submission_score_hist = aq_stats.average_submission_score_hist,
        submission_score_array_averages = aq_stats.submission_score_array_averages,
        submission_score_array_variances = aq_stats.submission_score_array_variances,
        incremental_submission_score_array_averages = aq_stats.incremental_submission_score_array_averages,
        incremental_submission_score_array_variances = aq_stats.incremental_submission_score_array_variances,
        incremental_submission_points_array_averages = aq_stats.incremental_submission_points_array_averages,
        incremental_submission_points_array_variances = aq_stats.incremental_submission_points_array_variances,
        average_number_submissions = aq_stats.average_number_submissions,
        number_submissions_variance = aq_stats.number_submissions_variance,
        number_submissions_hist = aq_stats.number_submissions_hist
    FROM
        aq_stats
        JOIN more_info ON TRUE
        JOIN quintile_scores_as_array ON TRUE
    WHERE
        aq.id = more_info.assessment_question_id;

END;
$$ LANGUAGE plpgsql VOLATILE;
