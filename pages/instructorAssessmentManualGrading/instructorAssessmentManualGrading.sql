-- BLOCK select_questions_manual_grading
WITH iq_with_last_submission AS (
    SELECT DISTINCT ON (iq.id)
        iq.id,
        iq.assessment_question_id,
        s.graded_at,
        s.id AS submission_id,
        umg.user_id,
        gj.manual_grading_conflict, -- perhaps bug, as last grading job is not necessarily a conflicting one. Must determine.
        gj.grading_method
    FROM
        assessment_questions AS aq
        JOIN instance_questions AS iq ON (iq.assessment_question_id = aq.id)
        JOIN variants AS v ON (v.instance_question_id = iq.id)
        JOIN submissions AS s ON (s.variant_id = v.id)
        LEFT JOIN grading_jobs AS gj ON (gj.submission_id = s.id)
        LEFT JOIN users_manual_grading AS umg ON (iq.id = umg.instance_question_id)
        LEFT JOIN users AS u ON (u.user_id = umg.user_id)
    WHERE
        aq.assessment_id = $assessment_id
    ORDER BY iq.id ASC, s.date DESC, s.id DESC, gj.id DESC, gj.date DESC
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
        AND (iqwls.graded_at IS NULL OR iqwls.manual_grading_conflict IS TRUE OR iqwls.grading_method != 'Manual'::enum_grading_method)) AS num_ungraded,
    (SELECT COUNT(iqwls.id)
     FROM
         iq_with_last_submission AS iqwls
     WHERE
         iqwls.assessment_question_id = aq.id
         -- A graded item will have a graded_at datestamp, and the last grading_job would be of a 'Manual' type.
         -- Also, a grading conflict must be resolved to be considered grading, or it will land in the next ungraded query.
         -- Finally, the grading_job may not exist if only a 'save' action occured instead of a 'save and grade' action
         AND iqwls.graded_at IS NOT NULL
         AND iqwls.grading_method = 'Manual'::enum_grading_method -- enum_grading_method
         AND iqwls.manual_grading_conflict IS FALSE) AS num_graded,
    (SELECT array_agg(DISTINCT u.uid)
     FROM
        iq_with_last_submission AS iqwls
        LEFT JOIN users_manual_grading AS umg ON (umg.instance_question_id = iqwls.id)
        LEFT JOIN users AS u ON (umg.user_id = u.user_id)
     WHERE
         iqwls.user_id IS NOT NULL
         AND iqwls.assessment_question_id = aq.id
         AND iqwls.graded_at IS NOT NULL
         AND iqwls.manual_grading_conflict IS FALSE) AS manual_grading_users
FROM
    assessment_questions AS aq
    JOIN questions AS q ON (q.id = aq.question_id)
    JOIN alternative_groups AS ag ON (ag.id = aq.alternative_group_id)
WHERE
    aq.assessment_id = $assessment_id
    AND aq.deleted_at IS NULL
    AND q.deleted_at IS NULL
    AND q.grading_method_manual = TRUE -- do we want this from the submission grading method flags perhaps?
ORDER BY aq.number;
