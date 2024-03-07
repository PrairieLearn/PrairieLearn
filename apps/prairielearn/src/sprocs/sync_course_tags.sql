CREATE FUNCTION
    sync_course_tags(
        IN valid_course_info boolean,
        IN delete_unused boolean,
        IN course_info_tags JSONB[],
        IN question_tag_names text[],
        IN syncing_course_id bigint,
        OUT new_tags_json JSONB
    )
AS $$
DECLARE
    question_tags_item JSONB;
    keep_tag_ids bigint[];
    existing_tag_ids bigint[];
    inserted_tag_ids bigint[];
    num_existing_tags bigint;
BEGIN
    IF valid_course_info THEN
        WITH new_tags AS (
            INSERT INTO tags (
                name,
                number,
                description,
                color,
                course_id
            ) SELECT
                tag->>0,
                number,
                tag->>1,
                tag->>2,
                syncing_course_id
            FROM UNNEST(course_info_tags) WITH ORDINALITY AS t(tag, number)
            ON CONFLICT (name, course_id) DO UPDATE
            SET
                number = EXCLUDED.number,
                color = EXCLUDED.color,
                description = EXCLUDED.description
            RETURNING id
        )
        SELECT array_agg(id) INTO keep_tag_ids FROM (SELECT id FROM new_tags) AS ids;

        num_existing_tags := array_length(keep_tag_ids, 1);
    ELSE
        SELECT COUNT(*) INTO num_existing_tags
        FROM tags
        WHERE course_id = syncing_course_id;
    END IF;

    -- We need to handle potentially-unknown question tags in two phases.
    -- First, we'll determine the IDs of all tags that we definitely need
    -- to keep. Then, we'll attempt to insert any missing tags and record the
    -- IDs of new rows. After this, any ID not captured above in those two
    -- categories (or handled  in new_tags above) can be deleted.
    SELECT array_agg(id) INTO existing_tag_ids FROM (
        SELECT id FROM tags WHERE name IN (SELECT UNNEST(question_tag_names))
    ) AS ids;
    keep_tag_ids := array_cat(keep_tag_ids, existing_tag_ids);

    WITH new_tags AS (
        INSERT INTO tags (
            name,
            number,
            description,
            color,
            course_id
        ) SELECT
            name,
            (num_existing_tags + number),
            'Auto-generated from use in a question; add this tag to your infoCourse.json file to customize',
            'gray1',
            syncing_course_id
        FROM UNNEST(question_tag_names) WITH ORDINALITY AS t(name, number)
        ON CONFLICT (name, course_id) DO NOTHING
        RETURNING id
    )
    SELECT array_agg(id) INTO inserted_tag_ids FROM (SELECT id FROM new_tags) AS ids;
    keep_tag_ids := array_cat(keep_tag_ids, inserted_tag_ids);

    IF delete_unused THEN
        DELETE FROM tags AS t
        WHERE
            t.course_id = syncing_course_id
            AND t.id NOT IN (SELECT UNNEST(keep_tag_ids));
    END IF;

    -- Make a map from tag name to ID to return to the caller
    SELECT
        coalesce(
            jsonb_agg(jsonb_build_array(t.name, t.id)),
            '[]'::jsonb
        ) AS tags_json
    FROM tags AS t
    INTO new_tags_json
    WHERE t.course_id = syncing_course_id;
END;
$$ LANGUAGE plpgsql VOLATILE;
