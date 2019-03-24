COPY (
    WITH num_exams AS (
        SELECT :num_exams AS num_exams
    ),
    relevant_users AS ( -- all students that took Quiz 6 for TAM 212 / Fa16
        SELECT
            u.*
        FROM
            users AS u
            JOIN assessment_instances AS ai ON (u.user_id = ai.user_id)
        WHERE
            ai.assessment_id = 4867
    ),
    relevant_assessments AS ( -- only one assessment - our custom quiz
        SELECT
            a.*
        FROM
            assessments AS a
        WHERE
            a.tid=:tid
    ),
    quintile_stats AS (
        SELECT
            *
        FROM
            relevant_assessments
            JOIN LATERAL get_quintile_stats(relevant_assessments.id) AS quintile_stats ON quintile_stats.assessment_id = relevant_assessments.id
    ),
    relevant_questions AS (
        SELECT
            q.id
        FROM
            questions AS q
            JOIN assessment_questions AS aq ON q.id = aq.question_id
            JOIN relevant_assessments AS a ON aq.assessment_id = a.id
    ),
    relevant_question_scores AS (
        SELECT
            avg(iq.points / aq.max_points) AS actual_score,
            u.user_id,
            q.id AS question_id
        FROM
            instance_questions AS iq
            JOIN assessment_questions AS aq ON (iq.assessment_question_id = aq.id)
            JOIN assessment_instances AS ai ON (iq.assessment_instance_id = ai.id)
            JOIN assessments AS a ON (ai.assessment_id = a.id)
            JOIN course_instances AS ci ON (a.course_instance_id = ci.id)
            JOIN relevant_questions AS q ON (aq.question_id = q.id)
            JOIN relevant_users AS u ON (ai.user_id = u.user_id)
        GROUP BY
            u.user_id,
            q.id
    ),
    generated_assessments AS (
        SELECT
            row_number() OVER () AS assessment_id,
            generated_assessment_question_ids,
            filter_generated_assessment(generated_assessment_question_ids, quintile_stats.means, quintile_stats.sds, 'Exams', :num_sds, 0).active_quintiles AS active_quintiles
        FROM
            relevant_assessments AS a
            CROSS JOIN num_exams
            CROSS JOIN quintile_stats
            CROSS JOIN get_generated_aq_ids_multiple_reps(a.id, num_exams.num_exams)
                AS generated_assessment_question_ids
    ),
--     generated_assessments_flattened AS (
--         SELECT
--             ga.assessment_id,
--             ga.keep,
--             unnest(ga.generated_assessment_question_ids) AS generated_assessment_question_id
--         FROM
--             generated_assessments AS ga
--     ),
--     expected_assessment_scores AS (
--         SELECT
--             u.user_id AS user_id,
--             ga.assessment_id AS assessment_id,
--             avg(rqs.actual_score) AS actual_assessment_score
--         FROM
--             relevant_users AS u
--             CROSS JOIN generated_assessments_flattened AS ga
--             JOIN assessment_questions AS aq ON (ga.generated_assessment_question_id = aq.id)
--             JOIN questions AS q ON (aq.question_id = q.id)
--             JOIN relevant_question_scores AS rqs ON (rqs.user_id = u.user_id AND q.id = rqs.question_id)
--         GROUP BY
--             ga.assessment_id,
--             u.user_id
--     ),
--     to_export AS (
--         SELECT
--             expected_assessment_scores.user_id AS "User ID",
--             expected_assessment_scores.assessment_id AS "Assessment ID",
--             expected_assessment_scores.actual_assessment_score * 100 AS "Score",
--             ga.keep AS "Keep"
--         FROM
--             generated_assessments AS ga
--             JOIN expected_assessment_scores ON (ga.assessment_id = expected_assessment_scores.assessment_id)
--             CROSS JOIN num_exams
--     ) SELECT * FROM to_export
) TO :output_filename CSV HEADER;
