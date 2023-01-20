CREATE FUNCTION
    sync_topics(
        IN valid_course_info boolean,
        IN delete_unused boolean,
        IN course_info_topics JSONB[],
        IN question_topic_names text[],
        IN syncing_course_id bigint
    ) RETURNS void
AS $$
DECLARE
    question_topics_item JSONB;
    keep_topic_ids bigint[];
    existing_topic_ids bigint[];
    inserted_topic_ids bigint[];
    num_existing_topics bigint;
BEGIN
    IF valid_course_info THEN
        WITH new_topics AS (
            INSERT INTO topics (
                name,
                number,
                description,
                color,
                course_id
            ) SELECT
                topic->>0,
                number,
                topic->>1,
                topic->>2,
                syncing_course_id
            FROM UNNEST(course_info_topics) WITH ORDINALITY AS t(topic, number)
            ON CONFLICT (name, course_id) DO UPDATE
            SET
                number = EXCLUDED.number,
                color = EXCLUDED.color,
                description = EXCLUDED.description
            RETURNING id
        )
        SELECT array_agg(id) INTO keep_topic_ids FROM (SELECT id FROM new_topics) AS ids;

        num_existing_topics := array_length(keep_topic_ids, 1);
    ELSE
        SELECT COUNT(*) INTO num_existing_topics
        FROM topics
        WHERE course_id = syncing_course_id;
    END IF;

    -- We need to handle potentially-unknown topics in two phases.
    -- First, we'll determine the IDs of all topics that we definitely need
    -- to keep. Then, we'll attempt to insert any missing topics and record the
    -- IDs of new rows. After this, any ID not captured above in those two
    -- categories (or handled  in new_topics above) can be deleted.
    SELECT array_agg(id) INTO existing_topic_ids FROM (
        SELECT id FROM topics WHERE name IN (SELECT UNNEST(question_topic_names))
    ) AS ids;
    keep_topic_ids := array_cat(keep_topic_ids, existing_topic_ids);

    WITH new_topics AS (
        INSERT INTO topics (
            name,
            number,
            description,
            color,
            course_id
        ) SELECT
            name,
            (num_existing_topics + number),
            'Auto-generated from use in a question; add this topic to your infoCourse.json file to customize',
            'gray1',
            syncing_course_id
        FROM UNNEST(question_topic_names) WITH ORDINALITY AS t(name, number)
        ON CONFLICT (name, course_id) DO NOTHING
        RETURNING id
    )
    SELECT array_agg(id) INTO inserted_topic_ids FROM (SELECT id FROM new_topics) AS ids;
    keep_topic_ids := array_cat(keep_topic_ids, inserted_topic_ids);

    IF delete_unused THEN
        DELETE FROM topics AS t
        WHERE
            t.course_id = syncing_course_id
            AND t.id NOT IN (SELECT UNNEST(keep_topic_ids));
    END IF;
END;
$$ LANGUAGE plpgsql VOLATILE;
