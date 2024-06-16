CREATE FUNCTION
    sync_course_sharing_sets(
        IN valid_course_info boolean,
        IN course_info_tags JSONB[],
        IN syncing_course_id bigint,
        OUT new_tags_json JSONB
    )
AS $$
DECLARE
    used_tag_names text[];
    inserted_tag_names text[];
BEGIN
    -- We will use the used_tag_names variable to track all the valid tags
    -- (either existing or new).

    IF valid_course_info THEN
        WITH new_tags AS (
            INSERT INTO tags (
                course_id,
                name,
                number,
                description,
                color,
                implicit
            ) SELECT
                syncing_course_id,
                tag->>0,
                number,
                tag->>1,
                tag->>2,
                FALSE
            FROM UNNEST(course_info_tags) WITH ORDINALITY AS t(tag, number)
            ON CONFLICT (course_id, name) DO UPDATE
            SET
                number = EXCLUDED.number,
                color = EXCLUDED.color,
                description = EXCLUDED.description,
                implicit = EXCLUDED.implicit
            RETURNING name
        )
        SELECT array_agg(name) INTO used_tag_names FROM new_tags;
    ELSE
        -- If we don't have valid course info, we aren't going to delete anything
        -- so we need to account for existing tags.
        SELECT array_agg(name) INTO used_tag_names
        FROM tags
        WHERE course_id = syncing_course_id;
    END IF;

    used_tag_names := array_cat(used_tag_names, inserted_tag_names);

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
