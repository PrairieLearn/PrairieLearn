CREATE OR REPLACE FUNCTION
    assessment_questions_calculate_stats (
        assessment_question_id_var bigint
    ) RETURNS VOID
AS $$
BEGIN
    WITH mean_question_scores AS (
        SELECT
            ai.user_id,
            aq.question_id,
            aq.assessment_id,
            aq.id AS assessment_question_id,
            avg(iq.number_attempts) as average_number_attempts,
            admin_assessment_question_number(aq.id) as number,
            avg(iq.score_perc) as user_score_perc
        FROM
            instance_questions AS iq
            JOIN assessment_instances AS ai ON (iq.assessment_instance_id = ai.id)
            JOIN assessment_questions AS aq ON (iq.assessment_question_id = aq.id)
            JOIN assessments AS a ON (ai.assessment_id = a.id)
            JOIN course_instances AS ci ON (a.course_instance_id = ci.id)
            JOIN enrollments AS e ON (ai.user_id = e.user_id AND ci.id = e.course_instance_id)
        WHERE
            aq.deleted_at IS NULL
            AND aq.id = assessment_question_id_var
            AND e.role = 'Student'
        GROUP BY
            ai.user_id,
            aq.question_id,
            aq.id,
            aq.assessment_id
    ),
    mean_assessment_scores_without_quintiles AS (
        SELECT
            ai.user_id,
            ai.assessment_id,
            avg(ai.score_perc) AS user_score_perc
        FROM
            assessment_instances AS ai
            JOIN assessments AS a ON (ai.assessment_id = a.id)
            JOIN course_instances AS ci ON (a.course_instance_id = ci.id)
            JOIN enrollments AS e ON (ai.user_id = e.user_id AND ci.id = e.course_instance_id)
        WHERE
            e.role = 'Student'
        GROUP BY
            ai.user_id,
            ai.assessment_id
    ),
    mean_assessment_scores AS (
        SELECT
            mean_assessment_scores_without_quintiles.user_id,
            mean_assessment_scores_without_quintiles.assessment_id,
            mean_assessment_scores_without_quintiles.user_score_perc,
            ntile(5) OVER (
              PARTITION BY mean_assessment_scores_without_quintiles.assessment_id
              ORDER BY mean_assessment_scores_without_quintiles.user_score_perc
            ) as quintile
        FROM
            mean_assessment_scores_without_quintiles
    ),
    assessment_question_users AS (
        SELECT
            aq.question_id,
            ai.user_id,
            aq.assessment_id,
            aq.id AS assessment_question_id
        FROM
            instance_questions AS iq
            JOIN assessment_instances AS ai ON (iq.assessment_instance_id=ai.id)
            JOIN assessment_questions AS aq ON (iq.assessment_question_id=aq.id)
            JOIN assessments AS a ON (ai.assessment_id = a.id)
            JOIN course_instances AS ci ON (a.course_instance_id = ci.id)
            JOIN enrollments AS e ON (ai.user_id = e.user_id AND ci.id = e.course_instance_id)
        WHERE
            aq.deleted_at IS NULL
            AND aq.id = assessment_question_id_var
            AND e.role = 'Student'
        GROUP BY
            ai.user_id,
            aq.question_id,
            aq.id,
            aq.assessment_id
    ),
    question_score_quintiles AS (
        SELECT
            assessment_question_users.assessment_question_id,
            mean_assessment_scores.quintile AS user_quintile,
            avg(mean_question_scores.user_score_perc) AS score_perc
        FROM
            assessment_question_users
            JOIN mean_assessment_scores ON (
                mean_assessment_scores.user_id = assessment_question_users.user_id
                AND mean_assessment_scores.assessment_id = assessment_question_users.assessment_id
            )
            JOIN mean_question_scores ON (
                mean_question_scores.assessment_question_id = assessment_question_users.assessment_question_id
                AND mean_question_scores.user_id = assessment_question_users.user_id
            )
        GROUP BY
            mean_assessment_scores.quintile,
            assessment_question_users.assessment_question_id
        ORDER BY
            mean_assessment_scores.quintile
    ),
    question_score_quintiles_condensed AS (
        SELECT
            question_score_quintiles.assessment_question_id,
            array_agg(question_score_quintiles.score_perc) AS quintile_scores
        FROM
            question_score_quintiles
        GROUP BY
            question_score_quintiles.assessment_question_id
    ),
    aq_stats1 AS (
        SELECT
            mean_question_scores.assessment_question_id,
            greatest(0, least(100, avg(mean_question_scores.user_score_perc))) AS mean_score_per_question,
            greatest(0, least(100, corr(mean_question_scores.user_score_perc, mean_assessment_scores.user_score_perc) * 100.0)) as discrimination,
            avg(mean_question_scores.average_number_attempts) as average_number_attempts
        FROM
            mean_question_scores
            JOIN mean_assessment_scores
                ON (
                    mean_assessment_scores.user_id = mean_question_scores.user_id
                    AND mean_assessment_scores.assessment_id = mean_question_scores.assessment_id
                )
        GROUP BY
            mean_question_scores.assessment_question_id
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
            instance_questions AS iq
            JOIN assessment_questions AS aq ON iq.assessment_question_id = aq.id
            JOIN assessment_instances AS ai ON (iq.assessment_instance_id = ai.id)
            JOIN assessments AS a ON (ai.assessment_id = a.id)
            JOIN course_instances AS ci ON (a.course_instance_id = ci.id)
            JOIN enrollments AS e ON (ai.user_id = e.user_id AND ci.id = e.course_instance_id)
        WHERE
            aq.id = assessment_question_id_var
            AND e.role = 'Student'
        AND aq.deleted_at IS NULL
        GROUP BY aq.id
    ),
    num_attempts_histogram AS (
        SELECT
            iq.assessment_question_id,
            histogram(iq.number_attempts, 1, 10, 9) as num_attempts_histogram
        FROM
            instance_questions AS iq
            JOIN assessment_instances AS ai ON (iq.assessment_instance_id = ai.id)
            JOIN assessments AS a ON (ai.assessment_id = a.id)
            JOIN course_instances AS ci ON (a.course_instance_id = ci.id)
            JOIN enrollments AS e ON (ai.user_id = e.user_id AND ci.id = e.course_instance_id)
        WHERE
            iq.number_attempts != 0
            AND e.role = 'Student'
        GROUP BY
            iq.assessment_question_id
    )
    UPDATE assessment_questions AS aq
    SET
        mean_score = aq_stats1.mean_score_per_question,
        discrimination = aq_stats1.discrimination,
        average_number_attempts = aq_stats1.average_number_attempts,
        quintile_scores = question_score_quintiles_condensed.quintile_scores,
        some_correct_submission_perc = aq_stats2.perc_some_correct_submission,
        first_attempt_correct_perc = aq_stats2.perc_correct_on_first_attempt,
        last_attempt_correct_perc = aq_stats2.perc_correct_on_last_attempt,
        some_submission_perc = aq_stats2.perc_question_attempted,
        average_of_average_success_rates = aq_stats2.average_success_rate,
        average_success_rate_hist = aq_stats2.average_success_rate_hist,
        average_length_of_incorrect_streak_with_some_correct_submission = aq_stats2.average_length_of_incorrect_streak_over_students_with_some_correct_submission,
        length_of_incorrect_streak_hist_with_some_correct_submission = aq_stats2.length_of_incorrect_streak_hist_over_students_with_some_correct_submission,
        average_length_of_incorrect_streak_with_no_correct_submission = aq_stats2.average_length_of_incorrect_streak_over_students_with_no_correct_submission,
        length_of_incorrect_streak_hist_with_no_correct_submission = aq_stats2.length_of_incorrect_streak_hist_over_students_with_no_correct_submission,
        num_attempts_hist = num_attempts_histogram.num_attempts_histogram
    FROM
        aq_stats2
        JOIN aq_stats1 ON aq_stats2.assessment_question_id = aq_stats1.assessment_question_id
        JOIN question_score_quintiles_condensed
            ON (
                aq_stats2.assessment_question_id = question_score_quintiles_condensed.assessment_question_id
            )
        JOIN num_attempts_histogram ON num_attempts_histogram.assessment_question_id = aq_stats2.assessment_question_id
    WHERE
        aq.id = aq_stats2.assessment_question_id
        AND aq.deleted_at IS NULL;

END;
$$ LANGUAGE plpgsql VOLATILE;
