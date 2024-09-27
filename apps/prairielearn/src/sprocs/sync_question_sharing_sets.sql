CREATE FUNCTION
    sync_question_sharing_sets(
        IN new_question_sharing_sets JSONB[]
    ) RETURNS void
AS $$
BEGIN
    INSERT INTO sharing_set_questions (
        question_id,
        sharing_set_id
    ) SELECT
        (question_sharing_sets_item->>0)::bigint,
        JSONB_ARRAY_ELEMENTS_TEXT(question_sharing_sets_item->1)::bigint AS sharing_set_id
    FROM UNNEST(new_question_sharing_sets) AS question_sharing_sets_item
    ON CONFLICT (question_id, sharing_set_id) DO NOTHING;
END;
$$ LANGUAGE plpgsql VOLATILE;
