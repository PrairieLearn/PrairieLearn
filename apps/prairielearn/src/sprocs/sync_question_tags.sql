CREATE FUNCTION
    sync_question_tags(
        IN new_question_tags JSONB[]
    ) RETURNS void
AS $$
BEGIN
    INSERT INTO question_tags (question_id, tag_id)
    SELECT
        (question_tags_item->>0)::bigint,
        JSONB_ARRAY_ELEMENTS_TEXT(question_tags_item->1)::bigint
    FROM UNNEST(new_question_tags) AS question_tags_item
    ON CONFLICT (question_id, tag_id) DO NOTHING;

    DELETE FROM question_tags AS qt
    USING UNNEST(new_question_tags) AS nqt
    WHERE
        qt.question_id = (nqt->>0)::BIGINT
        AND qt.tag_id NOT IN (SELECT JSONB_ARRAY_ELEMENTS_TEXT(nqt->1)::BIGINT);

END;
$$ LANGUAGE plpgsql VOLATILE;
