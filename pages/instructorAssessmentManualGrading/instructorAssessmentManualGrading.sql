-- BLOCK select_questions_manual_grading
WITH instance_questions_with_submission AS (
    SELECT
        iq.assessment_question_id,
        COUNT(1) FILTER (WHERE iq.requires_manual_grading) AS num_instance_questions_to_grade,
        COUNT(1) AS num_instance_questions
    FROM instance_questions iq
    WHERE EXISTS(SELECT 1
                 FROM variants AS v JOIN submissions AS s ON (s.variant_id = v.id)
                 WHERE v.instance_question_id = iq.id)
    GROUP BY iq.assessment_question_id
)
SELECT
    aq.*,
    q.qid,
    q.title,
    q.id AS question_id,
    admin_assessment_question_number(aq.id) as number,
    ag.number AS alternative_group_number,
    (count(*) OVER (PARTITION BY ag.number)) AS alternative_group_size,
    iqs.num_instance_questions,
    iqs.num_instance_questions_to_grade
FROM
    assessment_questions AS aq
    JOIN questions AS q ON (q.id = aq.question_id)
    JOIN alternative_groups AS ag ON (ag.id = aq.alternative_group_id)
    LEFT JOIN instance_questions_with_submission iqs ON (iqs.assessment_question_id = aq.id)
WHERE
    aq.assessment_id = $assessment_id
    AND aq.deleted_at IS NULL
    AND q.deleted_at IS NULL
ORDER BY aq.number;
