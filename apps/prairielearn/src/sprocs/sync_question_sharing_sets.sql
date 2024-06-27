CREATE FUNCTION
    sync_question_sharing_sets(
        IN new_question_sharing_sets JSONB[]
    ) RETURNS void
AS $$
DECLARE
    question_sharing_sets_item JSONB;
BEGIN
    FOREACH question_sharing_sets_item IN ARRAY new_question_sharing_sets LOOP
        INSERT INTO sharing_set_questions (
            question_id,
            sharing_set_id
        ) SELECT
            (question_sharing_sets_item->>0)::bigint,
            sharing_set_id::bigint
        FROM JSONB_ARRAY_ELEMENTS_TEXT(question_sharing_sets_item->1) AS sharing_set_id
        ON CONFLICT (question_id, sharing_set_id) DO NOTHING;
    END LOOP;
END;
$$ LANGUAGE plpgsql VOLATILE;
