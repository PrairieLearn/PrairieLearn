CREATE FUNCTION
    sync_question_tags(
        IN new_question_tags JSONB[]
    ) RETURNS void
AS $$
DECLARE
    question_tags_item JSONB;
BEGIN
    FOREACH question_tags_item IN ARRAY new_question_tags LOOP
        INSERT INTO question_tags (
            question_id,
            tag_id
        ) SELECT
            (question_tags_item->>0)::bigint,
            tag_id::bigint
        FROM JSONB_ARRAY_ELEMENTS_TEXT(question_tags_item->1) AS tag_id
        ON CONFLICT (question_id, tag_id) DO NOTHING;

        DELETE FROM question_tags AS qt
        WHERE
            qt.question_id = (question_tags_item->>0)::bigint
            AND qt.tag_id NOT IN (SELECT JSONB_ARRAY_ELEMENTS_TEXT(question_tags_item->1)::bigint);
    END LOOP;
END;
$$ LANGUAGE plpgsql VOLATILE;
