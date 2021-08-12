-- BLOCK get_variant_by_iq
SELECT *
FROM variants
WHERE instance_question_id = $iqId
LIMIT 1;
