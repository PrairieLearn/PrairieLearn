-- BLOCK instance_question_select_last_variant 
SELECT *
FROM
    variants as v
    JOIN instance_questions as iq ON (v.instance_question_id = iq.id)
    JOIN submissions as s ON (v.id = s.variant_id)
WHERE instance_question_id = $instance_question_id
ORDER BY v.id DESC
LIMIT 1;
