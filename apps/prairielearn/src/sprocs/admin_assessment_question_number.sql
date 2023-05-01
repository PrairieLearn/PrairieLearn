CREATE FUNCTION
    admin_assessment_question_number (
        assessment_question_id bigint
    ) RETURNS text
AS $$
SELECT
    CASE
        WHEN questions_in_same_group.count = 1 THEN ag.number::text
        ELSE ag.number::text || '.' || aq.number_in_alternative_group::text
    END
FROM
    assessment_questions AS aq
    JOIN alternative_groups AS ag ON (ag.id = aq.alternative_group_id)
    JOIN LATERAL (SELECT count(*) FROM assessment_questions WHERE alternative_group_id = ag.id AND deleted_at IS NULL) AS questions_in_same_group ON TRUE
WHERE
    aq.id = assessment_question_id;
$$ LANGUAGE SQL;
