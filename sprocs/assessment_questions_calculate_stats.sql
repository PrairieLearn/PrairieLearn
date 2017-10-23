CREATE OR REPLACE FUNCTION
    assessment_questions_calculate_stats (
        assessment_question_id_param bigint
    ) RETURNS VOID
AS $$
WITH
relevant_assessment_instances AS (
    SELECT ai.*
    FROM
        assessment_questions AS aq
        JOIN assessments AS a ON (a.id = aq.assessment_id)
        JOIN assessment_instances AS ai ON (ai.assessment_id = a.id)
        JOIN enrollments AS e ON (e.user_id = ai.user_id AND e.course_instance_id = a.course_instance_id)
    WHERE
        aq.id = assessment_question_id_param
        AND e.role = 'Student'
),
relevant_instance_questions AS (
    SELECT
        iq.*,
        ai.user_id
    FROM
        instance_questions AS iq
        JOIN relevant_assessment_instances AS ai ON (ai.id = iq.assessment_instance_id)
    WHERE iq.assessment_question_id = assessment_question_id_param
),
assessment_scores_by_user AS (
    SELECT
        ai.user_id,
        max(ai.score_perc) AS score_perc
    FROM relevant_assessment_instances AS ai
    GROUP BY ai.user_id
),
question_stats_by_user AS (
    SELECT
        iq.user_id,
        avg(iq.score_perc) AS score_perc,
        100 * count(iq.id) FILTER (WHERE iq.some_submission = TRUE) / count(iq.id)         AS some_submission_perc,
        100 * count(iq.id) FILTER (WHERE iq.some_perfect_submission = TRUE) / count(iq.id) AS some_perfect_submission_perc,
        100 * count(iq.id) FILTER (WHERE iq.some_nonzero_submission = TRUE) / count(iq.id) AS some_nonzero_submission_perc,
        avg(iq.first_submission_score)                     AS first_submission_score,
        avg(iq.last_submission_score)                      AS last_submission_score,
        avg(iq.max_submission_score)                       AS max_submission_score,
        avg(iq.average_submission_score)                   AS average_submission_score,
        array_avg(iq.submission_score_array)               AS submission_score_array,
        array_avg(iq.incremental_submission_score_array)   AS incremental_submission_score_array,
        array_avg(iq.incremental_submission_points_array)  AS incremental_submission_points_array,
        avg(iq.number_attempts)                            AS number_submissions
    FROM relevant_instance_questions AS iq
    GROUP BY iq.user_id
),
user_quintiles AS (
    SELECT
        assessment_scores_by_user.user_id,
        ntile(5) OVER (
            ORDER BY assessment_scores_by_user.score_perc
        ) as quintile
    FROM assessment_scores_by_user
),
quintile_scores AS (
    SELECT avg(question_stats_by_user.score_perc) AS quintile_score
    FROM
        question_stats_by_user
        JOIN user_quintiles USING (user_id)
    GROUP BY user_quintiles.quintile
    ORDER BY user_quintiles.quintile
),
quintile_scores_as_array AS (
    SELECT array_agg(quintile_score) AS scores
    FROM quintile_scores
),
aq_stats AS (
    SELECT
        greatest(0, least(100, avg(question_stats_by_user.score_perc)))                     AS mean_question_score,
        sqrt(var_pop(question_stats_by_user.score_perc))                                    AS question_score_variance,
        corr(question_stats_by_user.score_perc, assessment_scores_by_user.score_perc) * 100 AS discrimination,
        avg(question_stats_by_user.some_submission_perc)                                    AS some_submission_perc,
        avg(question_stats_by_user.some_perfect_submission_perc)                            AS some_perfect_submission_perc,
        avg(question_stats_by_user.some_nonzero_submission_perc)                            AS some_nonzero_submission_perc,
        avg(question_stats_by_user.first_submission_score)                                  AS average_first_submission_score,
        sqrt(var_pop(question_stats_by_user.first_submission_score))                        AS first_submission_score_variance,
        histogram(question_stats_by_user.first_submission_score, 0, 1, 10)                  AS first_submission_score_hist,
        avg(question_stats_by_user.last_submission_score)                                   AS average_last_submission_score,
        sqrt(var_pop(question_stats_by_user.last_submission_score))                         AS last_submission_score_variance,
        histogram(question_stats_by_user.last_submission_score, 0, 1, 10)                   AS last_submission_score_hist,
        avg(question_stats_by_user.max_submission_score)                                    AS average_max_submission_score,
        sqrt(var_pop(question_stats_by_user.max_submission_score))                          AS max_submission_score_variance,
        histogram(question_stats_by_user.max_submission_score, 0, 1, 10)                    AS max_submission_score_hist,
        avg(question_stats_by_user.average_submission_score)                                AS average_average_submission_score,
        sqrt(var_pop(question_stats_by_user.average_submission_score))                      AS average_submission_score_variance,
        histogram(question_stats_by_user.average_submission_score, 0, 1, 10)                AS average_submission_score_hist,
        array_avg(question_stats_by_user.submission_score_array)                            AS submission_score_array_averages,
        array_var(question_stats_by_user.submission_score_array)                            AS submission_score_array_variances,
        array_avg(question_stats_by_user.incremental_submission_score_array)                AS incremental_submission_score_array_averages,
        array_var(question_stats_by_user.incremental_submission_score_array)                AS incremental_submission_score_array_variances,
        array_avg(question_stats_by_user.incremental_submission_points_array)               AS incremental_submission_points_array_averages,
        array_var(question_stats_by_user.incremental_submission_points_array)               AS incremental_submission_points_array_variances,
        avg(question_stats_by_user.number_submissions)                                      AS average_number_submissions,
        var_pop(question_stats_by_user.number_submissions)                                  AS number_submissions_variance,
        histogram(question_stats_by_user.number_submissions, 0, 10, 10)                     AS number_submissions_hist
    FROM
        question_stats_by_user
        JOIN assessment_scores_by_user USING (user_id)
)

UPDATE assessment_questions AS aq
SET
    quintile_question_scores                      = quintile_scores_as_array.scores,
    mean_question_score                           = aq_stats.mean_question_score,
    question_score_variance                       = aq_stats.question_score_variance,
    discrimination                                = aq_stats.discrimination,
    some_submission_perc                          = aq_stats.some_submission_perc,
    some_perfect_submission_perc                  = aq_stats.some_perfect_submission_perc,
    some_nonzero_submission_perc                  = aq_stats.some_nonzero_submission_perc,
    average_first_submission_score                = aq_stats.average_first_submission_score,
    first_submission_score_variance               = aq_stats.first_submission_score_variance,
    first_submission_score_hist                   = aq_stats.first_submission_score_hist,
    average_last_submission_score                 = aq_stats.average_last_submission_score,
    last_submission_score_variance                = aq_stats.last_submission_score_variance,
    last_submission_score_hist                    = aq_stats.last_submission_score_hist,
    average_max_submission_score                  = aq_stats.average_max_submission_score,
    max_submission_score_variance                 = aq_stats.max_submission_score_variance,
    max_submission_score_hist                     = aq_stats.max_submission_score_hist,
    average_average_submission_score              = aq_stats.average_average_submission_score,
    average_submission_score_variance             = aq_stats.average_submission_score_variance,
    average_submission_score_hist                 = aq_stats.average_submission_score_hist,
    submission_score_array_averages               = aq_stats.submission_score_array_averages,
    submission_score_array_variances              = aq_stats.submission_score_array_variances,
    incremental_submission_score_array_averages   = aq_stats.incremental_submission_score_array_averages,
    incremental_submission_score_array_variances  = aq_stats.incremental_submission_score_array_variances,
    incremental_submission_points_array_averages  = aq_stats.incremental_submission_points_array_averages,
    incremental_submission_points_array_variances = aq_stats.incremental_submission_points_array_variances,
    average_number_submissions                    = aq_stats.average_number_submissions,
    number_submissions_variance                   = aq_stats.number_submissions_variance,
    number_submissions_hist                       = aq_stats.number_submissions_hist
FROM
    quintile_scores_as_array,
    aq_stats
WHERE
    aq.id = assessment_question_id_param;
$$ LANGUAGE SQL VOLATILE;
