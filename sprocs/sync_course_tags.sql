-- Accepts a course ID and a list of tags, ensures the tags are all present in
-- the database, and removes any old unused tags.

CREATE OR REPLACE FUNCTION
    sync_course_tags(
        IN new_tags JSONB,
        IN new_course_id bigint,
        OUT new_tag_ids bigint[]
    )
AS $$
DECLARE
    tag_number integer := 1;
    new_tag_id bigint;
    tag JSONB;
BEGIN
    FOR tag IN SELECT * FROM JSONB_ARRAY_ELEMENTS(new_tags) LOOP
        INSERT INTO tags
                (name, number, color, description, course_id)
        VALUES (tag->>0, tag_number, tag->>1, tag->>2, new_course_id)
        ON CONFLICT (name, course_id) DO UPDATE
        SET
            number = EXCLUDED.number,
            color = EXCLUDED.color,
            description = EXCLUDED.description
        RETURNING id INTO new_tag_id;

        new_tag_ids := array_append(new_tag_ids, new_tag_id);
        tag_number := tag_number + 1;
    END LOOP;

    -- Remove any tags from this course that aren't in use
    DELETE FROM tags AS t
    WHERE
        t.course_id = new_course_id
        AND t.id NOT IN (SELECT unnest(new_tag_ids));
END;
$$ LANGUAGE plpgsql VOLATILE;
