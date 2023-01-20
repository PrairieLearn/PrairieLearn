-- BLOCK select_variant
SELECT
    v.*
FROM
    variants AS v
WHERE
    v.id = $variant_id
    -- We check both `question_id` and `instance_question_id` to make sure that
    -- this variant is actually accessible by the user. Both will have been
    -- validated by middleware. For the instructor preview page, we don't have
    -- an instance question, so we ignore it in that case.
    AND v.question_id = $question_id
    AND (($has_instance_question IS FALSE) OR (v.instance_question_id = $instance_question_id));
