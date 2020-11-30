-- BLOCK instance_question_select_last_variant 
SELECT v.*
FROM
    variants as v
    JOIN instance_questions as iq ON (v.instance_question_id = iq.id)
WHERE instance_question_id = $instance_question_id
ORDER BY v.id DESC
LIMIT 1;

-- BLOCK instance_question_select_question
SELECT q.*
FROM
    questions as q
    JOIN assessment_questions AS aq ON (q.id = aq.question_id)
    JOIN instance_questions AS iq ON (aq.id = iq.assessment_question_id)
WHERE iq.id = $instance_question_id;