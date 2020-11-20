/* UPDATE variants AS v
SET broken = true
FROM 
    assessment_questions aq
    JOIN instance_questions iq ON iq.assessment_question_id = aq.id
WHERE
    v.instance_question_id = iq.id
    AND aq.id = $assessment_question_id
RETURNING v.id AS updated_variant_id; */

/*
SELECT 
    v.id AS variant_id,
    v.broken AS variant_broken,
    v.open AS variant_open
FROM
    variants v
    JOIN instance_questions iq ON v.instance_question_id = iq.id
    JOIN assessment_questions aq ON iq.assessment_question_id = aq.id
WHERE aq.id = $assessment_question_id; 
*/

UPDATE variants AS v
SET broken = true
FROM
    assessment_questions aq 
    JOIN instance_questions iq ON iq.assessment_question_id=aq.id
WHERE
    v.instance_question_id = iq.id
RETURNING v.id AS updated_variant_id;