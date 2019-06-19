-- Accepts a course ID and a list of objects containins qids and tag IDs,
-- ensures that all question tags are updated in the DB, and removes
-- any old unused question tags. 

CREATE OR REPLACE FUNCTION
    sync_question_tags(
        IN new_question_tags JSONB
    ) RETURNS void
AS $$
DECLARE
    question JSONB;
    question_tag JSONB;
    question_tag_id bigint;
    new_question_id bigint;
    new_question_tag_id bigint;
    new_question_tag_ids bigint[] := array[]::bigint[];
    question_tag_number integer := 1;
    tag JSONB;
BEGIN
    FOR question IN SELECT * FROM JSONB_ARRAY_ELEMENTS(new_question_tags) LOOP
        new_question_id := (question->>0)::bigint;

        FOR question_tag IN SELECT * FROM JSONB_ARRAY_ELEMENTS(question->1) LOOP
            -- Necessary because values come to us as quoted strings
            question_tag_id := trim('""' FROM question_tag::text)::bigint;

            INSERT INTO question_tags
                (question_id, tag_id, number)
            VALUES (new_question_id::bigint, question_tag_id, question_tag_number)
            ON CONFLICT (question_id, tag_id) DO UPDATE
            SET
                number = question_tag_number
            RETURNING id INTO new_question_tag_id;

            new_question_tag_ids := array_append(new_question_tag_ids, new_question_tag_id);
            question_tag_number := question_tag_number + 1;
        END LOOP;

        DELETE FROM question_tags AS qt
        WHERE
            qt.question_id = (new_question_id)::bigint
            AND qt.id NOT IN (SELECT unnest(new_question_tag_ids));

        new_question_tag_ids := array[]::bigint[];
        question_tag_number := 1;
    END LOOP;
END;
$$ LANGUAGE plpgsql VOLATILE;
