-- BLOCK select_questions_manual_grading
WITH iq_with_last_submission AS (
    SELECT DISTINCT ON (iq.id)
        iq.id, s.graded_at,
        iq.assessment_question_id,
        umg.user_id,
        gj.manual_grading_conflict
    FROM
        assessment_questions AS aq
        JOIN instance_questions AS iq ON (iq.assessment_question_id = aq.id)
        JOIN variants AS v ON (v.instance_question_id = iq.id)
        JOIN submissions AS s ON (s.variant_id = v.id)
        LEFT JOIN users_manual_grading AS umg ON (iq.id = umg.instance_question_id)
        LEFT JOIN users AS u ON (u.user_id = umg.user_id)
        LEFT JOIN grading_jobs AS gj ON (gj.submission_id = s.id)
    WHERE
        aq.assessment_id = $assessment_id
    ORDER BY iq.id ASC, s.date DESC, s.id DESC, gj.manual_grading_conflict ASC
)
SELECT
    aq.*,
    q.qid,
    q.title,
    q.id AS question_id,
    admin_assessment_question_number(aq.id) as number,
    ag.number AS alternative_group_number,
    (count(*) OVER (PARTITION BY ag.number)) AS alternative_group_size,
    (SELECT COUNT(iqwls.id)
     FROM 
         iq_with_last_submission AS iqwls
     WHERE 
        iqwls.assessment_question_id = aq.id
        AND (iqwls.graded_at IS NULL OR iqwls.manual_grading_conflict = TRUE)) AS num_ungraded,
    (SELECT COUNT(iqwls.id)
     FROM 
         iq_with_last_submission AS iqwls
     WHERE 
         iqwls.assessment_question_id = aq.id
         AND iqwls.graded_at IS NOT NULL) AS num_graded,
    (SELECT array_agg(DISTINCT u.uid)
     FROM
        iq_with_last_submission AS iqwls
        LEFT JOIN users_manual_grading AS umg ON (umg.instance_question_id = iqwls.id)
        LEFT JOIN users AS u ON (umg.user_id = u.user_id)
     WHERE
         iqwls.user_id IS NOT NULL
         AND iqwls.assessment_question_id = aq.id
         AND (
                (
                iqwls.graded_at IS NULL
                AND umg.date_started >= (NOW() - $manual_grading_expiry_sec::interval)
                )
                OR
                (
                iqwls.graded_at IS NOT NULL
                AND umg.date_graded IS NOT NULL
                )
            )
         ) AS manual_grading_users
FROM
    assessment_questions AS aq
    JOIN questions AS q ON (q.id = aq.question_id)
    JOIN alternative_groups AS ag ON (ag.id = aq.alternative_group_id)
WHERE
    aq.assessment_id = $assessment_id
    AND aq.deleted_at IS NULL
    AND q.deleted_at IS NULL
ORDER BY aq.number;
