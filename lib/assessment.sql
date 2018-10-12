-- BLOCK check_belongs
SELECT
    ai.id
FROM
    assessment_instances AS ai
    JOIN assessments AS a ON (a.id = ai.assessment_id)
WHERE
    ai.id = $assessment_instance_id
    AND a.id = $assessment_id;
