CREATE OR REPLACE FUNCTION
    instance_questions_calculate_stats(
        instance_question_id_var bigint
    ) RETURNS VOID
AS $$
BEGIN
    WITH subs AS (
        SELECT
            s.id,
            s.correct,
            v.instance_question_id
        FROM
            submissions AS s
            JOIN variants AS v ON s.variant_id = v.id
            JOIN instance_questions AS iq ON (v.instance_question_id = iq.id)
            JOIN assessment_instances AS ai ON (iq.assessment_instance_id = ai.id)
            JOIN assessments AS a ON (ai.assessment_id = a.id)
            JOIN course_instances AS ci ON (a.course_instance_id = ci.id)
            JOIN enrollments AS e ON (ai.user_id = e.user_id AND ci.id = e.course_instance_id)
        WHERE
            graded_at IS NOT NULL
            AND v.instance_question_id = instance_question_id_var
            AND e.role = 'Student'
        ORDER BY s.date
    ),
    attempts AS (
        SELECT
            iq.id AS instance_question_id,
            array_agg(subs.correct) AS attempts
        FROM
            instance_questions AS iq
            LEFT JOIN subs ON iq.id = subs.instance_question_id
            JOIN assessment_instances AS ai ON (iq.assessment_instance_id = ai.id)
            JOIN assessments AS a ON (ai.assessment_id = a.id)
            JOIN course_instances AS ci ON (a.course_instance_id = ci.id)
            JOIN enrollments AS e ON (ai.user_id = e.user_id AND ci.id = e.course_instance_id)
        WHERE
            iq.id = instance_question_id_var
            AND e.role = 'Student'
        GROUP BY iq.id
    ),
    iq_stats AS (
        SELECT
            iq.id AS instance_question_id,
            coalesce(bool_or(subs.correct), FALSE) AS some_correct_submission,
            attempts.attempts AS attempts,
            (attempts.attempts)[1] AS correct_on_first_attempt,
            (attempts.attempts)[array_length(attempts.attempts, 1)] AS correct_on_last_attempt,
            count(subs.id) > 0 AS question_attempted,
            (case
             when count(subs.id) != 0
                 then 100 * avg(subs.correct::int)
             else NULL
             end) as average_success_rate,
            length_of_incorrect_streak(attempts.attempts) AS length_of_incorrect_streak,
            count(subs.id) AS num_submissions
        FROM
            instance_questions AS iq
            LEFT JOIN subs ON iq.id = subs.instance_question_id
            JOIN attempts ON iq.id = attempts.instance_question_id
            JOIN assessment_instances AS ai ON (iq.assessment_instance_id = ai.id)
            JOIN assessments AS a ON (ai.assessment_id = a.id)
            JOIN course_instances AS ci ON (a.course_instance_id = ci.id)
            JOIN enrollments AS e ON (ai.user_id = e.user_id AND ci.id = e.course_instance_id)
        WHERE
            iq.id = instance_question_id_var
            AND e.role = 'Student'
        GROUP BY iq.id, attempts.attempts
    )
    UPDATE
        instance_questions AS iq
    SET
        some_correct_submission = iq_stats.some_correct_submission,
        first_attempt_correct = iq_stats.correct_on_first_attempt,
        last_attempt_correct = iq_stats.correct_on_last_attempt,
        some_submission = iq_stats.question_attempted,
        average_success_rate = iq_stats.average_success_rate,
        length_of_incorrect_streak = iq_stats.length_of_incorrect_streak
    FROM
        iq_stats
    WHERE
        iq.id = iq_stats.instance_question_id;
END;
$$ LANGUAGE plpgsql VOLATILE;
