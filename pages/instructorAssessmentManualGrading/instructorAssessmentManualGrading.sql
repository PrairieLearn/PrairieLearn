-- BLOCK select_questions_manual_grading
SELECT
    aq.*,
    q.qid,
    q.title,
    q.id AS question_id,
    admin_assessment_question_number(aq.id) as number,
    ag.number AS alternative_group_number,
    (count(*) OVER (PARTITION BY ag.number)) AS alternative_group_size,
    (SELECT COUNT(DISTINCT iq.id)
     FROM
         instance_questions AS iq
         JOIN variants AS v ON (v.instance_question_id = iq.id)
         JOIN submissions AS s ON (s.variant_id = v.id)
     WHERE
         iq.assessment_question_id = aq.id
    ) AS num_submissions,
    (SELECT COUNT(*) FROM
        (SELECT DISTINCT ON (iq.id) iq.id, s.graded_at
         FROM
             instance_questions AS iq
             JOIN variants AS v ON (v.instance_question_id = iq.id)
             JOIN submissions AS s ON (s.variant_id = v.id)
         WHERE
             iq.assessment_question_id = aq.id
         GROUP BY iq.id, s.date, s.graded_at
         ORDER BY iq.id DESC, s.date DESC
         ) AS submission_info
     WHERE submission_info.graded_at IS NULL) AS num_ungraded_submissions
FROM
    assessment_questions AS aq
    JOIN questions AS q ON (q.id = aq.question_id)
    JOIN alternative_groups AS ag ON (ag.id = aq.alternative_group_id)
WHERE
    aq.assessment_id = $assessment_id
    AND aq.deleted_at IS NULL
    AND q.deleted_at IS NULL
ORDER BY aq.number;
