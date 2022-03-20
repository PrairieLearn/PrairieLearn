DROP VIEW IF EXISTS instance_questions_for_grading;
CREATE VIEW instance_questions_for_grading AS
SELECT
    iq.*,
    ai.assessment_id
FROM
    instance_questions AS iq
    JOIN assessment_instances AS ai ON (ai.id = iq.assessment_instance_id)
WHERE
    EXISTS(SELECT 1
           FROM variants AS v JOIN submissions AS s ON (s.variant_id = v.id)
           WHERE v.instance_question_id = iq.id);

