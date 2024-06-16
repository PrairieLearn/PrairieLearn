CREATE FUNCTION
    sync_course_sharing_sets(
        IN valid_course_info boolean,
        IN course_info_sharing_sets JSONB[],
        IN syncing_course_id bigint,
        OUT new_sharing_sets_json JSONB
    )
AS $$
DECLARE
    inserted_sharing_set_names text[];
BEGIN
    IF valid_course_info THEN
        INSERT INTO sharing_sets (
            course_id,
            name
        ) SELECT
            syncing_course_id,
            sharing_set->>0
        FROM UNNEST(course_info_sharing_sets) WITH ORDINALITY AS t(sharing_set)
        ON CONFLICT (course_id, name)
        DO NOTHING;
        -- DO UPDATE SET description = EXCLUDED.description;
    END IF;

    SELECT
        coalesce(
            jsonb_agg(jsonb_build_array(t.name, t.id)),
            '[]'::jsonb
        ) AS sharing_sets_json
    FROM sharing_sets AS t
    INTO new_sharing_sets_json
    WHERE t.course_id = syncing_course_id;
END;
$$ LANGUAGE plpgsql VOLATILE;
