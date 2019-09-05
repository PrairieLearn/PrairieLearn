-- Accepts a list of lists containing question IDs and tag IDs,
-- ensures that all question tags are updated in the DB, and removes
-- any old unused question tags. 

CREATE OR REPLACE FUNCTION
    sync_question_tags(
        IN new_question_tags JSONB
    ) RETURNS void
AS $$
DECLARE
    question JSONB;
BEGIN
    FOR question IN SELECT * FROM JSONB_ARRAY_ELEMENTS(new_question_tags) LOOP
        INSERT INTO question_tags (
            question_id,
            tag_id
        ) SELECT
            (question->>0)::bigint,
            tag_id::bigint
        FROM JSONB_ARRAY_ELEMENTS_TEXT(question->1) AS tag_id
        ON CONFLICT (question_id, tag_id) DO NOTHING;

        DELETE FROM question_tags AS qt
        WHERE
            qt.question_id = (question->>0)::bigint
            AND qt.tag_id NOT IN (SELECT JSONB_ARRAY_ELEMENTS_TEXT(question->1)::bigint);
    END LOOP;
END;
$$ LANGUAGE plpgsql VOLATILE;
