CREATE OR REPLACE FUNCTION
    sync_topics(
        IN topics JSONB,
        IN new_course_id bigint
    ) returns void
AS $$
DECLARE
    topic JSONB;
    new_topic_id bigint;
    new_topic_ids bigint[];
BEGIN
    FOR topic IN SELECT * FROM JSONB_ARRAY_ELEMENTS(topics) LOOP
        INSERT INTO topics (
            name,
            number,
            color,
            description,
            course_id
        ) VALUES (
            topic->>'name',
            (topic->>'number')::integer,
            topic->>'color',
            topic->>'description',
            new_course_id
        ) ON CONFLICT (name, course_id) DO UPDATE
        SET
            number = EXCLUDED.number,
            color = EXCLUDED.color,
            description = EXCLUDED.description
        RETURNING id INTO new_topic_id;
        new_topic_ids := array_append(new_topic_ids, new_topic_id);
    END LOOP;

    -- Delete excess topics
    DELETE FROM topics AS top
    WHERE
        top.course_id = new_course_id
        AND top.id NOT IN (SELECT unnest(new_topic_ids));
END;
$$ LANGUAGE plpgsql VOLATILE;
