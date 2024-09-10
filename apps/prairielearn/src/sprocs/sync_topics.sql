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
    used_topic_names text[];
    inserted_topic_names text[];
BEGIN
    -- We will use the used_topic_names variable to track all the valid topics
    -- (either existing or new).

    -- First insert all the explicit topics, if we can. Keep a list of topic names
    -- that we've used.
    IF valid_course_info THEN
        WITH new_topics AS (
            INSERT INTO topics (
                course_id,
                name,
                number,
                description,
                color,
                implicit
            ) SELECT
                syncing_course_id,
                topic->>0,
                number,
                topic->>1,
                topic->>2,
                FALSE
            FROM UNNEST(course_info_topics) WITH ORDINALITY AS t(topic, number)
            ON CONFLICT (course_id, name) DO UPDATE
            SET
                number = EXCLUDED.number,
                color = EXCLUDED.color,
                description = EXCLUDED.description,
                implicit = EXCLUDED.implicit
            RETURNING name
        )
        SELECT array_agg(name) INTO used_topic_names FROM new_topics;
    ELSE
        -- If we don't have valid course info, we aren't going to delete anything
        -- so we need to account for existing topics.
        SELECT array_agg(name) INTO used_topic_names
        FROM topics
        WHERE course_id = syncing_course_id;
    END IF;

    -- Make sure we have a topic for every question topic, even those that don't
    -- appear in `infoCourse.json`.
    WITH new_topics AS (
        INSERT INTO topics (
            course_id,
            name,
            number,
            description,
            color,
            implicit
        ) SELECT
            syncing_course_id,
            name,
            (array_length(used_topic_names, 1) + (row_number() OVER ())),
            'Auto-generated from use in a question; add this topic to your infoCourse.json file to customize',
            'gray1',
            TRUE
        FROM 
            (SELECT UNNEST(question_topic_names) EXCEPT SELECT UNNEST(used_topic_names))
            AS t(name)
        ORDER BY name
        ON CONFLICT (course_id, name) DO UPDATE
        SET
            number = EXCLUDED.number,
            color = EXCLUDED.color,
            description = EXCLUDED.description,
            implicit = EXCLUDED.implicit
        RETURNING name
    )
    SELECT array_agg(name) INTO inserted_topic_names FROM new_topics;

    used_topic_names := array_cat(used_topic_names, inserted_topic_names);

    IF delete_unused THEN
        DELETE FROM topics AS t
        WHERE
            t.course_id = syncing_course_id
            AND t.name NOT IN (SELECT UNNEST(used_topic_names));
    END IF;
END;
$$ LANGUAGE plpgsql VOLATILE;
