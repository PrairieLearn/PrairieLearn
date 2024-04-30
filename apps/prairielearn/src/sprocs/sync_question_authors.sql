CREATE FUNCTION
    sync_question_authors(
        IN new_question_authors JSONB[]
    ) RETURNS void
AS $$
DECLARE
    question_authors_item JSONB;
BEGIN
    FOREACH question_authors_item IN ARRAY new_question_authors LOOP
        INSERT INTO question_authors (
            question_id,
            author_name
        ) SELECT
            (question_authors_item->>0)::bigint,
            author_name::bigint
        FROM JSONB_ARRAY_ELEMENTS_TEXT(question_authors_item->1) AS author_name
        ON CONFLICT (question_id, author_name) DO NOTHING;

        DELETE FROM question_authors AS qa
        WHERE
            qa.question_id = (question_authors_item->>0)::bigint
            AND qa.author_name NOT IN (SELECT JSONB_ARRAY_ELEMENTS_TEXT(question_authors_item->1)::bigint);
    END LOOP;
END;
$$ LANGUAGE plpgsql VOLATILE;
