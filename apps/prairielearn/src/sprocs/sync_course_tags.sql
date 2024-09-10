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
    used_tag_names text[];
    inserted_tag_names text[];
BEGIN
    -- We will use the used_tag_names variable to track all the valid tags
    -- (either existing or new).

    -- First insert all the explicit tags, if we can. Keep a list of tag names
    -- that we've used.
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

    -- Make sure we have a tag for every question tag, even those that don't
    -- appear in `infoCourse.json`.
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
            name,
            (array_length(used_tag_names, 1) + (row_number() OVER ())),
            'Auto-generated from use in a question; add this tag to your infoCourse.json file to customize',
            'gray1',
            TRUE
        FROM
            (SELECT UNNEST(question_tag_names) EXCEPT SELECT UNNEST(used_tag_names))
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
    SELECT array_agg(name) INTO inserted_tag_names FROM new_tags;

    used_tag_names := array_cat(used_tag_names, inserted_tag_names);

    IF delete_unused THEN
        DELETE FROM tags AS t
        WHERE
            t.course_id = syncing_course_id
            AND t.name NOT IN (SELECT UNNEST(used_tag_names));
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
