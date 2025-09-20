CREATE FUNCTION
    sync_question_authors(
        IN new_question_authors JSONB[]
    ) RETURNS void
AS $$
BEGIN
    INSERT INTO question_authors (question_id, author_id)
    SELECT
        (question_authors_item->>0)::bigint,
        JSONB_ARRAY_ELEMENTS_TEXT(question_authors_item->1)::bigint
    FROM UNNEST(new_question_authors) AS question_authors_item
    ON CONFLICT (question_id, author_id) DO NOTHING;

    DELETE FROM question_authors AS qa
    USING UNNEST(new_question_authors) AS nqa
    WHERE
        qa.question_id = (nqa->>0)::BIGINT
        AND qa.author_id NOT IN (SELECT JSONB_ARRAY_ELEMENTS_TEXT(nqa->1)::BIGINT);

END;
$$ LANGUAGE plpgsql VOLATILE;
