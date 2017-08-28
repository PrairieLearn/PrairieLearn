CREATE OR REPLACE FUNCTION
    assessment_questions_calculate_stats (
        assessment_question_id_var bigint
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
            aq.id = assessment_question_id_var
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
    relevant_assessments AS (
        SELECT
            a.*
        FROM
            assessments AS a
            JOIN more_info ON TRUE
        WHERE
            a.id = more_info.assessment_id
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
    number_attempts AS (
        SELECT
            avg(iq.number_attempts) AS average_number_attempts
        FROM
            relevant_instance_questions AS iq
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
            avg(ai.score_perc) AS user_score_perc
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
    aq_stats1 AS (
        SELECT
            greatest(0, least(100, avg(question_scores_by_user.user_score_perc))) AS mean_score_per_question,
            greatest(0, least(100, corr(question_scores_by_user.user_score_perc, assessment_scores_by_user.user_score_perc) * 100.0)) as discrimination
        FROM
            relevant_users AS u
            JOIN question_scores_by_user ON (question_scores_by_user.user_id = u.user_id)
            JOIN assessment_scores_by_user ON (assessment_scores_by_user.user_id = u.user_id)
    ),
    aq_stats2 AS (
        SELECT
            aq.id AS assessment_question_id,
            100 * avg(iq.some_correct_submission::int) AS perc_some_correct_submission,
            100 * avg(iq.first_attempt_correct::int) AS perc_correct_on_first_attempt,
            100 * avg(iq.last_attempt_correct::int) AS perc_correct_on_last_attempt,
            100 * avg(iq.some_submission::int) AS perc_question_attempted,
            avg(iq.average_success_rate) AS average_success_rate,
            histogram(iq.average_success_rate, 0, 100, 10) AS average_success_rate_hist,
            avg(iq.length_of_incorrect_streak)
                FILTER (WHERE iq.some_correct_submission = TRUE)
                AS average_length_of_incorrect_streak_over_students_with_some_correct_submission,
            histogram(iq.length_of_incorrect_streak, 0, 10, 10)
                FILTER (WHERE iq.some_correct_submission = TRUE)
                AS length_of_incorrect_streak_hist_over_students_with_some_correct_submission,
            avg(iq.length_of_incorrect_streak)
                FILTER (WHERE iq.some_correct_submission = FALSE)
                AS average_length_of_incorrect_streak_over_students_with_no_correct_submission,
            histogram(iq.length_of_incorrect_streak, 0, 10, 10)
                FILTER (WHERE iq.some_correct_submission = FALSE)
                AS length_of_incorrect_streak_hist_over_students_with_no_correct_submission

        FROM
            relevant_instance_questions AS iq
            JOIN assessment_questions AS aq ON iq.assessment_question_id = aq.id
        GROUP BY
            aq.id
    ),
    num_attempts_histogram AS (
        SELECT
            iq.assessment_question_id,
            histogram(iq.number_attempts, 1, 10, 10) as num_attempts_histogram
        FROM
            relevant_instance_questions AS iq
        WHERE
            iq.number_attempts != 0
        GROUP BY
            iq.assessment_question_id
    ),
    all_stats AS (
        SELECT
            *
        FROM
            aq_stats2
            JOIN aq_stats1 ON TRUE
            JOIN quintile_scores_as_array ON TRUE
            JOIN num_attempts_histogram ON TRUE
            JOIN number_attempts ON TRUE
    )
    UPDATE assessment_questions AS aq
    SET
        mean_score = all_stats.mean_score_per_question,
        discrimination = all_stats.discrimination,
        average_number_attempts = all_stats.average_number_attempts,
        quintile_scores = all_stats.quintile_scores,
        some_correct_submission_perc = all_stats.perc_some_correct_submission,
        first_attempt_correct_perc = all_stats.perc_correct_on_first_attempt,
        last_attempt_correct_perc = all_stats.perc_correct_on_last_attempt,
        some_submission_perc = all_stats.perc_question_attempted,
        average_of_average_success_rates = all_stats.average_success_rate,
        average_success_rate_hist = all_stats.average_success_rate_hist,
        average_length_of_incorrect_streak_with_some_correct_submission = all_stats.average_length_of_incorrect_streak_over_students_with_some_correct_submission,
        length_of_incorrect_streak_hist_with_some_correct_submission = all_stats.length_of_incorrect_streak_hist_over_students_with_some_correct_submission,
        average_length_of_incorrect_streak_with_no_correct_submission = all_stats.average_length_of_incorrect_streak_over_students_with_no_correct_submission,
        length_of_incorrect_streak_hist_with_no_correct_submission = all_stats.length_of_incorrect_streak_hist_over_students_with_no_correct_submission,
        num_attempts_hist = all_stats.num_attempts_histogram
    FROM
        all_stats
        JOIN more_info ON TRUE
    WHERE
        aq.id = more_info.assessment_question_id;

END;
$$ LANGUAGE plpgsql VOLATILE;
