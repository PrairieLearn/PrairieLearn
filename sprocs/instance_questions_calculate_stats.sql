CREATE OR REPLACE FUNCTION
    instance_questions_calculate_stats(
        instance_question_id_var bigint
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
            instance_questions AS iq
            JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
            JOIN assessments AS a ON (a.id = aq.assessment_id)
        WHERE
            iq.id = instance_question_id_var
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
    relevant_instance_questions AS (
        SELECT
            iq.*
        FROM
            instance_questions AS iq
            JOIN assessment_instances AS ai ON (iq.assessment_instance_id = ai.id)
            JOIN user_roles ON (user_roles.user_id = ai.user_id)
        WHERE
            iq.id = instance_question_id_var
            AND user_roles.role = 'Student'
    ),
    relevant_submissions AS (
        SELECT
            s.*,
            v.instance_question_id
        FROM
            submissions AS s
            JOIN variants AS v ON (s.variant_id = v.id)
            JOIN relevant_instance_questions AS iq ON (v.instance_question_id = iq.id)
        WHERE
            graded_at IS NOT NULL
        ORDER BY
            s.date
    ),
    attempts AS (
        SELECT
            iq.id AS instance_question_id,
            count(s.id) > 0 AS some_submission,
            coalesce(bool_or(s.score = 1), FALSE) AS some_perfect_submission,
            coalesce(bool_or(s.score != 0), FALSE) AS some_nonzero_submission,
            array_agg(s.score) AS submission_scores,
            max(s.score) AS max_submission_score,
            avg(s.score) AS average_submission_score
        FROM
            relevant_instance_questions AS iq
            LEFT JOIN relevant_submissions AS s ON (iq.id = s.instance_question_id)
        GROUP BY
            iq.id

    ),
    iq_stats AS (
        SELECT
            iq.id AS instance_question_id,
            attempts.some_submission AS some_submission,
            attempts.some_perfect_submission AS some_perfect_submission,
            attempts.some_nonzero_submission AS some_nonzero_submission,
            attempts.submission_scores[1] AS first_submission_score,
            attempts.submission_scores[array_length(attempts.submission_scores, 1)] AS last_submission_score,
            attempts.max_submission_score AS max_submission_score,
            attempts.average_submission_score AS average_submission_score,
            attempts.submission_scores AS submission_score_array,
            calculate_incremental_submission_score_array(attempts.submission_scores) AS incremental_submission_score_array,
            array_product(calculate_incremental_submission_score_array(attempts.submission_scores), iq.points_list) AS incremental_submission_points_array
        FROM
            relevant_instance_questions AS iq
            JOIN attempts ON (iq.id = attempts.instance_question_id)
    )
    UPDATE
        instance_questions AS iq
    SET
        some_submission = iq_stats.some_submission,
        some_perfect_submission = iq_stats.some_perfect_submission,
        some_nonzero_submission = iq_stats.some_nonzero_submission,
        first_submission_score = iq_stats.first_submission_score,
        last_submission_score = iq_stats.last_submission_score,
        max_submission_score = iq_stats.max_submission_score,
        average_submission_score = iq_stats.average_submission_score,
        submission_score_array = iq_stats.submission_score_array,
        incremental_submission_score_array = iq_stats.incremental_submission_score_array,
        incremental_submission_points_array = iq_stats.incremental_submission_points_array
    FROM
        iq_stats
    WHERE
        iq.id = iq_stats.instance_question_id;
END;
$$ LANGUAGE plpgsql VOLATILE;
