-- BLOCK select_variant
SELECT
    v.*
FROM
    variants AS v
WHERE
    v.id = $variant_id
    AND v.instance_question_id = $instance_question_id; -- check for security
