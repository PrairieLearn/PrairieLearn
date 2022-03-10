-- BLOCK select_variant
SELECT
    v.*
FROM
    variants AS v
WHERE
    v.id = $variant_id
    AND v.question_id = $question_id; -- check for security
