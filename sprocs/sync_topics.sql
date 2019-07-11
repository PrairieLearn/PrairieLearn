CREATE OR REPLACE FUNCTION
    sync_topics(
        IN topics JSONB,
        IN new_course_id bigint
    ) returns void
AS $$
DECLARE
    new_topic_id bigint;
    new_topic_ids bigint[];
BEGIN
    WITH new_topics AS (
        INSERT INTO topics (
            name,
            number,
            color,
            description,
            course_id
        ) SELECT
            topic->>'name',
            number,
            topic->>'color',
            topic->>'description',
            new_course_id
        FROM JSONB_ARRAY_ELEMENTS(topics) WITH ORDINALITY AS t(topic, number)
        ON CONFLICT (name, course_id) DO UPDATE
        SET
            number = EXCLUDED.number,
            color = EXCLUDED.color,
            description = EXCLUDED.description
        RETURNING id, number
    )
    SELECT array_agg(id) INTO new_topic_ids FROM (SELECT id FROM new_topics ORDER BY number ASC) AS ids;

    -- Delete excess topics
    DELETE FROM topics AS top
    WHERE
        top.course_id = new_course_id
        AND top.id NOT IN (SELECT unnest(new_topic_ids));
END;
$$ LANGUAGE plpgsql VOLATILE;
