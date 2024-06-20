CREATE FUNCTION
    sync_course_instances(
        IN disk_course_instances_data JSONB[],
        IN syncing_course_id bigint,
        OUT name_to_id_map JSONB
    )
AS $$
DECLARE
    missing_dest_short_names TEXT;
    missing_src_short_names TEXT;
    mismatched_uuid_short_names TEXT;
    valid_course_instance record;
    syncing_course_instance_id bigint;
    course_instance_timezone TEXT;
    enrollment JSONB;
BEGIN
    -- The sync algorithm used here is described in the preprint
    -- "Preserving identity during opportunistic unidirectional
    -- synchronization via two-fold identifiers".

    -- Move all our data into a temporary table so it's easier to work with

    CREATE TEMPORARY TABLE disk_course_instances (
        short_name TEXT NOT NULL,
        uuid uuid,
        errors TEXT,
        warnings TEXT,
        data JSONB
    ) ON COMMIT DROP;

    INSERT INTO disk_course_instances (
        short_name,
        uuid,
        errors,
        warnings,
        data
    ) SELECT
        entries->>0,
        (entries->>1)::uuid,
        entries->>2,
        entries->>3,
        (entries->4)::JSONB
    FROM UNNEST(disk_course_instances_data) AS entries;

    -- Synchronize the dest (course_instances) with the src
    -- (disk_course_instances). This soft-deletes, un-soft-deletes,
    -- and inserts new rows in course_instances. No data is synced
    -- yet. Only the (id, course_id, uuid, short_name, deleted_at)
    -- columns are used.

    WITH
    matched_rows AS (
        -- See `sync_questions.sql` for an explanation of the use of DISTINCT ON.
        SELECT DISTINCT ON (src_short_name)
            src.short_name AS src_short_name,
            src.uuid AS src_uuid,
            dest.id AS dest_id
        FROM disk_course_instances AS src LEFT JOIN course_instances AS dest ON (
            dest.course_id = syncing_course_id
            AND (
                src.uuid = dest.uuid
                OR (
                    (src.uuid IS NULL OR dest.uuid IS NULL)
                    AND src.short_name = dest.short_name AND dest.deleted_at IS NULL
                )
            )
        )
        ORDER BY src_short_name, (src.uuid = dest.uuid) DESC NULLS LAST
    ),
    deactivate_unmatched_dest_rows AS (
        UPDATE course_instances AS dest
        SET deleted_at = now()
        WHERE dest.id NOT IN (
            SELECT dest_id FROM matched_rows WHERE dest_id IS NOT NULL
        ) AND dest.deleted_at IS NULL AND dest.course_id = syncing_course_id
    ),
    update_matched_dest_rows AS (
        UPDATE course_instances AS dest
        SET short_name = src_short_name, uuid = src_uuid, deleted_at = NULL
        FROM matched_rows
        WHERE dest.id = dest_id AND dest.course_id = syncing_course_id
    ),
    insert_unmatched_src_rows AS (
        -- UTC is used as a temporary timezone, which will be updated in following statements
        INSERT INTO course_instances AS dest
            (course_id, short_name, uuid, display_timezone, deleted_at)
        SELECT syncing_course_id, src_short_name, src_uuid, 'UTC', NULL
        FROM matched_rows
        WHERE dest_id IS NULL
        RETURNING dest.short_name AS src_short_name, dest.id AS inserted_dest_id
    )
    -- Make a map from CIID to ID to return to the caller
    SELECT COALESCE(jsonb_object_agg(src_short_name, COALESCE(dest_id, inserted_dest_id)), '{}'::JSONB)
    INTO name_to_id_map
    FROM matched_rows LEFT JOIN insert_unmatched_src_rows USING (src_short_name);

    -- Internal consistency checks to ensure that dest (course_instances) and
    -- src (disk_course_instances) are in fact synchronized.

    SELECT string_agg(src.short_name, ', ')
    INTO missing_dest_short_names
    FROM disk_course_instances AS src
    WHERE src.short_name NOT IN (SELECT dest.short_name FROM course_instances AS dest WHERE dest.course_id = syncing_course_id AND dest.deleted_at IS NULL);
    IF (missing_dest_short_names IS NOT NULL) THEN
        RAISE EXCEPTION 'Assertion failure: CIIDs on disk but not synced to DB: %', missing_dest_short_names;
    END IF;

    SELECT string_agg(dest.short_name, ', ')
    INTO missing_src_short_names
    FROM course_instances AS dest
    WHERE dest.course_id = syncing_course_id AND dest.deleted_at IS NULL AND dest.short_name NOT IN (SELECT src.short_name FROM disk_course_instances AS src);
    IF (missing_src_short_names IS NOT NULL) THEN
        RAISE EXCEPTION 'Assertion failure: CIIDs in DB but not on disk: %', missing_src_short_names;
    END IF;

    SELECT string_agg(src.short_name, ', ')
    INTO mismatched_uuid_short_names
    FROM disk_course_instances AS src JOIN course_instances AS dest ON (dest.course_id = syncing_course_id AND dest.short_name = src.short_name AND dest.deleted_at IS NULL)
    WHERE NOT (src.uuid = dest.uuid OR src.uuid IS NULL);
    IF (mismatched_uuid_short_names IS NOT NULL) THEN
        RAISE EXCEPTION 'Assertion failure: CIIDs on disk with mismatched UUIDs in DB: %', mismatched_uuid_short_names;
    END IF;

    -- At this point, there will be exactly one non-deleted row for
    -- all short_names that we loaded from disk. It is now safe to
    -- update all those rows with the new information from disk (if we
    -- have any).

    -- First pass: update complete information for all course instances without errors
    UPDATE course_instances AS dest
    SET
        long_name = src.data->>'long_name',
        assessments_group_by = (src.data->>'assessments_group_by')::enum_assessment_grouping,
        display_timezone = COALESCE(src.data->>'display_timezone', c.display_timezone),
        hide_in_enroll_page = (src.data->>'hide_in_enroll_page')::boolean,
        sync_errors = NULL,
        sync_warnings = src.warnings
    FROM
        disk_course_instances AS src
        JOIN pl_courses AS c ON (c.id = syncing_course_id)
    WHERE
        dest.short_name = src.short_name
        AND dest.deleted_at IS NULL
        AND dest.course_id = syncing_course_id
        AND (src.errors IS NULL OR src.errors = '');

    -- Now, loop over all valid course instances and sync access rules for them
    FOR valid_course_instance IN (
        SELECT short_name, data
        FROM disk_course_instances AS src
        WHERE (src.errors IS NULL OR src.errors = '')
    ) LOOP
        SELECT ci.id, ci.display_timezone
        INTO STRICT syncing_course_instance_id, course_instance_timezone
        FROM course_instances AS ci
        WHERE
            ci.short_name = valid_course_instance.short_name
            AND ci.deleted_at IS NULL
            AND ci.course_id = syncing_course_id;

        INSERT INTO course_instance_access_rules (
            course_instance_id,
            number,
            uids,
            start_date,
            end_date,
            institution
        ) SELECT
            syncing_course_instance_id,
            number,
            CASE
                WHEN access_rule->'uids' = null::JSONB THEN NULL
                ELSE jsonb_array_to_text_array(access_rule->'uids')
            END,
            input_date(access_rule->>'start_date', course_instance_timezone),
            input_date(access_rule->>'end_date', course_instance_timezone),
            access_rule->>'institution'
        FROM
            JSONB_ARRAY_ELEMENTS(valid_course_instance.data->'access_rules') WITH ORDINALITY AS t(access_rule, number)
        ON CONFLICT (number, course_instance_id) DO UPDATE
        SET
            uids = EXCLUDED.uids,
            start_date = EXCLUDED.start_date,
            end_date = EXCLUDED.end_date,
            institution = EXCLUDED.institution;

        -- Delete excess access rules
        DELETE FROM course_instance_access_rules
        WHERE
            course_instance_id = syncing_course_instance_id
            AND number > JSONB_ARRAY_LENGTH(valid_course_instance.data->'access_rules');
    END LOOP;

    -- Second pass: add errors where needed.
    UPDATE course_instances AS dest
    SET
        sync_errors = src.errors,
        sync_warnings = src.warnings
    FROM disk_course_instances AS src
    WHERE
        dest.short_name = src.short_name
        AND dest.deleted_at IS NULL
        AND dest.course_id = syncing_course_id
        AND (src.errors IS NOT NULL AND src.errors != '');
END;
$$ LANGUAGE plpgsql VOLATILE;
