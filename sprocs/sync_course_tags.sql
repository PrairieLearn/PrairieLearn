-- Accepts a course ID and a list of tags, ensures the tags are all present in
-- the database, and removes any old unused tags.

CREATE OR REPLACE FUNCTION
    sync_course_tags(
        IN tags JSONB,
        IN tags_course_id bigint,
        OUT new_tag_ids bigint[]
    )
AS $$
BEGIN
    WITH new_tags AS (
        INSERT INTO tags (
            name,
            number,
            color,
            description,
            course_id
        ) SELECT
            tag->>0,
            number,
            tag->>1,
            tag->>2,
            sync_course_tags.tags_course_id
        FROM JSONB_ARRAY_ELEMENTS(sync_course_tags.tags) WITH ORDINALITY AS t(tag, number)
        ON CONFLICT (name, course_id) DO UPDATE
        SET
            number = EXCLUDED.number,
            color = EXCLUDED.color,
            description = EXCLUDED.description
        RETURNING id
    )
    SELECT array_agg(id) INTO new_tag_ids FROM (SELECT id FROM new_tags) AS ids;

    -- Remove any tags from this course that aren't in use
    DELETE FROM tags AS t
    WHERE
        t.course_id = sync_course_tags.tags_course_id
        AND t.id NOT IN (SELECT unnest(new_tag_ids));
END;
$$ LANGUAGE plpgsql VOLATILE;
