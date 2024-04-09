CREATE FUNCTION
    sync_questions(
        IN disk_questions_data JSONB[],
        IN syncing_course_id bigint,
        OUT name_to_id_map JSONB
    )
AS $$
DECLARE
    missing_dest_qids TEXT;
    missing_src_qids TEXT;
    mismatched_uuid_qids TEXT;
BEGIN
    -- The sync algorithm used here is described in the preprint
    -- "Preserving identity during opportunistic unidirectional
    -- synchronization via two-fold identifiers".

    -- Move all our data into a temporary table so it's easier to work with

    CREATE TEMPORARY TABLE disk_questions (
        qid TEXT NOT NULL,
        uuid uuid,
        errors TEXT,
        warnings TEXT,
        data JSONB
    ) ON COMMIT DROP;


    INSERT INTO disk_questions (
        qid,
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
    FROM UNNEST(disk_questions_data) AS entries;

    -- Synchronize the dest (questions) with the src
    -- (disk_questions). This soft-deletes, un-soft-deletes, and
    -- inserts new rows in questions. No data is synced yet. Only the
    -- (id, course_id, uuid, qid, deleted_at) columns are used.

    WITH
    matched_rows AS (
        -- DISTINCT ON is necessary to ensure that we only try to update one
        -- row per qid. See comment below in ORDER BY for more details.
        SELECT DISTINCT ON (src_qid)
            src.qid AS src_qid,
            src.uuid AS src_uuid,
            dest.id AS dest_id
        FROM disk_questions AS src LEFT JOIN questions AS dest ON (
            dest.course_id = syncing_course_id
            AND (
                src.uuid = dest.uuid
                OR (
                    (src.uuid IS NULL OR dest.uuid IS NULL)
                    AND src.qid = dest.qid AND dest.deleted_at IS NULL
                )
            )
        )
        ORDER BY
            -- This ORDER BY clause is necessary for DISTINCT ON
            src_qid,
            -- Together with the use of DISTINCT ON, this ORDER BY clause
            -- ensures that, when given the choice between matching based on
            -- qid or uuid, we prefer matching based on uuid. This avoids a
            -- scenario where we try to insert a new row with a UUID that's
            -- already in use in another row.
            --
            -- See https://github.com/PrairieLearn/PrairieLearn/issues/6539 for
            -- a case where this occurred, including a description of how to
            -- reproduce it.
            (src.uuid = dest.uuid) DESC NULLS LAST
    ),
    deactivate_unmatched_dest_rows AS (
        UPDATE questions AS dest
        SET deleted_at = now()
        WHERE dest.id NOT IN (
            SELECT dest_id FROM matched_rows WHERE dest_id IS NOT NULL
        ) AND dest.deleted_at IS NULL AND dest.course_id = syncing_course_id
    ),
    update_matched_dest_rows AS (
        UPDATE questions AS dest
        SET qid = src_qid, uuid = src_uuid, deleted_at = NULL
        FROM matched_rows
        WHERE dest.id = dest_id AND dest.course_id = syncing_course_id
    ),
    insert_unmatched_src_rows AS (
        INSERT INTO questions AS dest (course_id, qid, uuid, deleted_at)
        SELECT syncing_course_id, src_qid, src_uuid, NULL
        FROM matched_rows
        WHERE dest_id IS NULL
        RETURNING dest.qid AS src_qid, dest.id AS inserted_dest_id
    )
    -- Make a map from QID to ID to return to the caller
    SELECT COALESCE(jsonb_object_agg(src_qid, COALESCE(dest_id, inserted_dest_id)), '{}'::JSONB)
    INTO name_to_id_map
    FROM matched_rows LEFT JOIN insert_unmatched_src_rows USING (src_qid);

    -- Internal consistency checks to ensure that dest (questions) and
    -- src (disk_questions) are in fact synchronized.

    SELECT string_agg(src.qid, ', ')
    INTO missing_dest_qids
    FROM disk_questions AS src
    WHERE src.qid NOT IN (SELECT dest.qid FROM questions AS dest WHERE dest.course_id = syncing_course_id AND dest.deleted_at IS NULL);
    IF (missing_dest_qids IS NOT NULL) THEN
        RAISE EXCEPTION 'Assertion failure: QIDs on disk but not synced to DB: %', missing_dest_qids;
    END IF;

    SELECT string_agg(dest.qid, ', ')
    INTO missing_src_qids
    FROM questions AS dest
    WHERE dest.course_id = syncing_course_id AND dest.deleted_at IS NULL AND dest.qid NOT IN (SELECT src.qid FROM disk_questions AS src);
    IF (missing_src_qids IS NOT NULL) THEN
        RAISE EXCEPTION 'Assertion failure: QIDs in DB but not on disk: %', missing_src_qids;
    END IF;

    SELECT string_agg(src.qid, ', ')
    INTO mismatched_uuid_qids
    FROM disk_questions AS src JOIN questions AS dest ON (dest.course_id = syncing_course_id AND dest.qid = src.qid AND dest.deleted_at IS NULL)
    WHERE NOT (src.uuid = dest.uuid OR src.uuid IS NULL);
    IF (mismatched_uuid_qids IS NOT NULL) THEN
        RAISE EXCEPTION 'Assertion failure: QIDs on disk with mismatched UUIDs in DB: %', mismatched_uuid_qids;
    END IF;

    -- At this point, there will be exactly one non-deleted row for all qids
    -- that we loaded from disk. It is now safe to update all those rows with
    -- the new information from disk (if we have any).

    -- First pass: update complete information for all questions without errors
    UPDATE questions AS dest
    SET
        directory = src.qid,
        type = (src.data->>'type')::enum_question_type,
        title = src.data->>'title',
        options = (src.data->'options')::JSONB,
        client_files = jsonb_array_to_text_array(src.data->'client_files'),
        partial_credit = (src.data->>'partial_credit')::boolean,
        grading_method = (src.data->>'grading_method')::enum_grading_method,
        single_variant = (src.data->>'single_variant')::boolean,
        show_correct_answer = (src.data->>'show_correct_answer')::boolean,
        template_directory = src.data->>'template_directory',
        topic_id = aggregates.topic_id,
        external_grading_enabled = (src.data->>'external_grading_enabled')::boolean,
        external_grading_image = src.data->>'external_grading_image',
        external_grading_files = jsonb_array_to_text_array(src.data->'external_grading_files'),
        external_grading_entrypoint = src.data->>'external_grading_entrypoint',
        external_grading_timeout = (src.data->>'external_grading_timeout')::integer,
        external_grading_enable_networking = (src.data->>'external_grading_enable_networking')::boolean,
        external_grading_environment = (src.data->>'external_grading_environment')::jsonb,
        dependencies = (src.data->>'dependencies')::jsonb,
        workspace_image = src.data->>'workspace_image',
        workspace_port = (src.data->>'workspace_port')::integer,
        workspace_args = src.data->>'workspace_args',
        workspace_home = src.data->>'workspace_home',
        workspace_graded_files = jsonb_array_to_text_array(src.data->'workspace_graded_files'),
        workspace_url_rewrite = (src.data->>'workspace_url_rewrite')::boolean,
        workspace_enable_networking = (src.data->>'workspace_enable_networking')::boolean,
        workspace_environment = (src.data->>'workspace_environment')::jsonb,
        sync_errors = NULL,
        sync_warnings = src.warnings
    FROM
        disk_questions AS src,
        -- Aggregates are not allowed in UPDATE clauses, so we need to do them in a
        -- subquery here
        (
            SELECT
                qid,
                (COALESCE((SELECT id FROM topics WHERE name = src.data->>'topic' AND course_id = syncing_course_id), NULL)) AS topic_id
            FROM disk_questions AS src
        ) AS aggregates
    WHERE
        dest.qid = src.qid
        AND dest.deleted_at IS NULL
        AND dest.qid = aggregates.qid
        AND dest.course_id = syncing_course_id
        AND (src.errors IS NULL OR src.errors = '');

    -- Second pass: add errors where needed. We'll also fill in everything we
    -- know without needing to know JSON, which is pretty much just the directory
    UPDATE questions AS dest
    SET
        directory = src.qid,
        sync_errors = src.errors,
        sync_warnings = src.warnings
    FROM disk_questions AS src
    WHERE
        dest.qid = src.qid
        AND dest.deleted_at IS NULL
        AND dest.course_id = syncing_course_id
        AND (src.errors IS NOT NULL AND src.errors != '');

    -- Ensure that all questions have numbers
    WITH
    questions_needing_numbers AS (
        SELECT id, row_number() OVER () AS index
        FROM questions
        WHERE
            number IS NULL
            AND course_id = syncing_course_id
        ORDER BY id
    ),
    new_numbers AS (
        SELECT *
        FROM random_unique(100, 1000, (SELECT array_agg(number) FROM questions WHERE course_id = syncing_course_id))
    ),
    questions_with_new_numbers AS (
        -- use row_number() as the matching key for the join
        SELECT qnn.id, nn.number
        FROM questions_needing_numbers AS qnn
        JOIN new_numbers AS nn ON (qnn.index = nn.index)
    )
    UPDATE questions AS q
    SET number = qwnn.number
    FROM questions_with_new_numbers AS qwnn
    WHERE q.id = qwnn.id;
END;
$$ LANGUAGE plpgsql VOLATILE;
