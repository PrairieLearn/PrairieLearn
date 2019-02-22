CREATE OR REPLACE FUNCTION
    instance_questions_select_variant (
        instance_question_id bigint,
        require_open boolean
    ) RETURNS TABLE (variant variants)
AS $$
BEGIN
    PERFORM instance_questions_lock(instance_question_id);

    RETURN QUERY
    SELECT v.*
    FROM variants AS v
    WHERE
        v.instance_question_id = instance_questions_select_variant.instance_question_id
        AND (NOT require_open OR v.open)
        AND NOT v.broken
    ORDER BY v.date DESC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql VOLATILE;
