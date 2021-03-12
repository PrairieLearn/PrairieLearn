-- BLOCK select_questions_manual_grading
WITH instance_questions_last_submission AS (
    SELECT DISTINCT ON (iq.id)
        iq.id, s.graded_at,
        iq.assessment_question_id,
        iq.manual_grading_user,
        iq.manual_grading_conflict
    FROM
        assessment_questions AS aq
        JOIN instance_questions AS iq ON (iq.assessment_question_id = aq.id)
        JOIN variants AS v ON (v.instance_question_id = iq.id)
        JOIN submissions AS s ON (s.variant_id = v.id)
    WHERE
        aq.assessment_id = $assessment_id
    ORDER BY iq.id ASC, s.date DESC, s.id DESC
)
SELECT
    aq.*,
    q.qid,
    q.title,
    q.id AS question_id,
    admin_assessment_question_number(aq.id) as number,
    ag.number AS alternative_group_number,
    (count(*) OVER (PARTITION BY ag.number)) AS alternative_group_size,
    (SELECT COUNT(iqls.id)
     FROM 
         instance_questions_last_submission AS iqls
     WHERE 
        iqls.assessment_question_id = aq.id
        AND (iqls.graded_at IS NULL OR iqls.manual_grading_conflict = TRUE)) AS num_ungraded,
    (SELECT COUNT(iqls.id)
     FROM 
         instance_questions_last_submission AS iqls
     WHERE 
         iqls.assessment_question_id = aq.id
         AND iqls.graded_at IS NOT NULL) AS num_graded,
    (SELECT array_agg(DISTINCT u.uid)
     FROM
        instance_questions_last_submission AS iqls
        LEFT JOIN users AS u ON (u.user_id = iqls.manual_grading_user)
     WHERE
         iqls.manual_grading_user IS NOT NULL
         AND iqls.assessment_question_id = aq.id) AS manual_grading_users
FROM
    assessment_questions AS aq
    JOIN questions AS q ON (q.id = aq.question_id)
    JOIN alternative_groups AS ag ON (ag.id = aq.alternative_group_id)
WHERE
    aq.assessment_id = $assessment_id
    AND aq.deleted_at IS NULL
    AND q.deleted_at IS NULL
ORDER BY aq.number;
