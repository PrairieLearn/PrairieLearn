-- testing effectiveness method 2 (generate exams)
COPY (
    WITH relevant_users AS ( -- all students that took Quiz 6 for TAM 212 / Fa16
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
    to_export AS (
        SELECT
            rqs.user_id AS "User ID",
            rqs.question_id AS "Question ID",
            rqs.actual_score * 100 AS "Score"
        FROM
            relevant_question_scores AS rqs
    ) SELECT * FROM to_export
) TO :output_filename CSV HEADER;
