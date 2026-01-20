CREATE FUNCTION
    sync_student_groups(
        IN disk_student_groups_data jsonb[],
        IN syncing_course_instance_id bigint,
        OUT name_to_id_map jsonb
    )
AS $$
DECLARE
    missing_dest_names TEXT;
    missing_src_names TEXT;
BEGIN
    -- Move all our data into a temporary table so it's easier to work with
    CREATE TEMPORARY TABLE disk_student_groups (
        name TEXT NOT NULL,
        color TEXT
    ) ON COMMIT DROP;

    INSERT INTO disk_student_groups (name, color)
    SELECT
        entries->>0,
        entries->>1
    FROM UNNEST(disk_student_groups_data) AS entries;

    -- Synchronize the dest (student_groups) with the src (disk_student_groups).
    -- This soft-deletes, un-soft-deletes, updates, and inserts rows.
    WITH
    matched_rows AS (
        SELECT
            src.name AS src_name,
            src.color AS src_color,
            dest.id AS dest_id
        FROM disk_student_groups AS src
        LEFT JOIN student_groups AS dest ON (
            dest.course_instance_id = syncing_course_instance_id
            AND dest.name = src.name
        )
    ),
    -- Soft-delete groups not on disk
    deactivate_unmatched_dest_rows AS (
        UPDATE student_groups AS dest
        SET deleted_at = NOW()
        WHERE dest.course_instance_id = syncing_course_instance_id
            AND dest.deleted_at IS NULL
            AND dest.name NOT IN (SELECT src_name FROM matched_rows)
    ),
    -- Update existing groups (un-soft-delete and update color)
    update_matched_dest_rows AS (
        UPDATE student_groups AS dest
        SET
            color = matched_rows.src_color,
            deleted_at = NULL
        FROM matched_rows
        WHERE dest.id = matched_rows.dest_id
            AND matched_rows.dest_id IS NOT NULL
    ),
    -- Insert new groups
    insert_unmatched_src_rows AS (
        INSERT INTO student_groups (course_instance_id, name, color)
        SELECT syncing_course_instance_id, src_name, src_color
        FROM matched_rows
        WHERE dest_id IS NULL
        RETURNING name AS src_name, id AS inserted_dest_id
    )
    -- Make a map from name to ID to return to the caller
    SELECT COALESCE(jsonb_object_agg(src_name, COALESCE(dest_id, inserted_dest_id)), '{}'::JSONB)
    INTO name_to_id_map
    FROM matched_rows
    LEFT JOIN insert_unmatched_src_rows USING (src_name);

    -- Internal consistency checks
    SELECT string_agg(src.name, ', ')
    INTO missing_dest_names
    FROM disk_student_groups AS src
    WHERE src.name NOT IN (
        SELECT dest.name
        FROM student_groups AS dest
        WHERE dest.course_instance_id = syncing_course_instance_id
            AND dest.deleted_at IS NULL
    );
    IF (missing_dest_names IS NOT NULL) THEN
        RAISE EXCEPTION 'Assertion failure: Student group names on disk but not synced to DB: %', missing_dest_names;
    END IF;

    SELECT string_agg(dest.name, ', ')
    INTO missing_src_names
    FROM student_groups AS dest
    WHERE dest.course_instance_id = syncing_course_instance_id
        AND dest.deleted_at IS NULL
        AND dest.name NOT IN (SELECT src.name FROM disk_student_groups AS src);
    IF (missing_src_names IS NOT NULL) THEN
        RAISE EXCEPTION 'Assertion failure: Student group names in DB but not on disk: %', missing_src_names;
    END IF;
END;
$$ LANGUAGE plpgsql VOLATILE;
