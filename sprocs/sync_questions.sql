DROP FUNCTION IF EXISTS sync_questions(JSONB, bigint);
CREATE OR REPLACE FUNCTION
    sync_questions(
        IN disk_questions_data JSONB[],
        IN syncing_course_id bigint,
        OUT new_questions_json JSONB
    )
AS $$
BEGIN
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

    -- First, update the names of everything we have a UUID for
    UPDATE questions AS q
    SET qid = dq.qid, deleted_at = NULL
    FROM disk_questions AS dq
    WHERE
        dq.uuid IS NOT NULL
        AND q.uuid = dq.uuid
        AND q.course_id = syncing_course_id;

    -- Next, add known UUIDs to previously synced questions without UUIDS
    UPDATE questions AS q
    SET uuid = dq.uuid 
    FROM disk_questions AS dq
    WHERE
        dq.uuid IS NOT NULL
        AND q.qid = dq.qid
        AND q.deleted_at IS NULL
        AND q.uuid IS NULL
        AND q.course_id = syncing_course_id;

    -- Next, soft-delete any rows for which we have a mismatched UUID
    UPDATE questions AS q
    SET deleted_at = now()
    FROM disk_questions AS dq
    WHERE
        q.qid = dq.qid
        AND q.deleted_at IS NOT NULL
        AND dq.uuid IS NOT NULL
        AND q.uuid IS NOT NULL
        AND q.uuid != dq.uuid
        AND q.course_id = syncing_course_id;

    -- Insert new rows for missing names for which we have a UUID
    WITH qids_to_insert AS (
        SELECT qid FROM disk_questions WHERE uuid IS NOT NULL
        EXCEPT
        SELECT qid FROM questions WHERE deleted_at IS NULL AND course_id = syncing_course_id
    )
    INSERT INTO questions (qid, uuid, course_id)
    SELECT
        qti.qid,
        dq.uuid,
        syncing_course_id
    FROM
        qids_to_insert AS qti
        JOIN disk_questions AS dq ON (dq.qid = qti.qid);

    -- Insert new rows for missing names for which we do not have a UUID
    WITH qids_to_insert AS (
        SELECT qid FROM disk_questions WHERE uuid IS NULL
        EXCEPT
        SELECT qid FROM questions WHERE deleted_at IS NULL AND course_id = syncing_course_id
    )
    INSERT INTO questions (qid, course_id)
    SELECT qid, syncing_course_id FROM qids_to_insert;

    -- Finally, soft-delete rows with unwanted names
    WITH qids_to_delete AS (
        SELECT qid FROM questions WHERE deleted_at IS NULL AND course_id = syncing_course_id
        EXCEPT
        SELECT qid FROM disk_questions
    )
    UPDATE questions
    SET deleted_at = now()
    FROM qids_to_delete
    WHERE questions.qid = qids_to_delete.qid;

    -- At this point, there will be exactly one non-deleted row for all qids
    -- that we loaded from disk. It is now safe to update all those rows with
    -- the new information from disk (if we have any).

    -- First pass: update complete information for all questions without errors
    UPDATE questions AS q
    SET
        directory = dq.qid,
        type = (dq.data->>'type')::enum_question_type,
        title = dq.data->>'title',
        options = (dq.data->'options')::JSONB,
        client_files = jsonb_array_to_text_array(dq.data->'client_files'),
        partial_credit = (dq.data->>'partial_credit')::boolean,
        grading_method = (dq.data->>'grading_method')::enum_grading_method,
        single_variant = (dq.data->>'single_variant')::boolean,
        template_directory = dq.data->>'template_directory',
        topic_id = aggregates.topic_id,
        external_grading_enabled = (dq.data->>'external_grading_enabled')::boolean,
        external_grading_image = dq.data->>'external_grading_image',
        external_grading_files = jsonb_array_to_text_array(dq.data->'external_grading_files'),
        external_grading_entrypoint = dq.data->>'external_grading_entrypoint',
        external_grading_timeout = (dq.data->>'external_grading_timeout')::integer,
        external_grading_enable_networking = (dq.data->>'external_grading_enable_networking')::boolean,
        dependencies = (dq.data->>'dependencies')::jsonb,
        workspace_image = dq.data->>'workspace_image',
        workspace_port = (dq.data->>'workspace_port')::integer,
        workspace_args = dq.data->>'workspace_args',
        workspace_graded_files = jsonb_array_to_text_array(dq.data->'workspace_graded_files'),
        sync_errors = NULL,
        sync_warnings = dq.warnings
    FROM
        disk_questions AS dq,
        -- Aggregates are not allowed in UPDATE clases, so we need to do them in a
        -- subquery here
        (
            SELECT
                qid,
                (COALESCE((SELECT id FROM topics WHERE name = dq.data->>'topic' AND course_id = syncing_course_id), NULL)) AS topic_id
            FROM disk_questions AS dq
        ) AS aggregates
    WHERE
        q.qid = dq.qid
        AND q.qid = aggregates.qid
        AND q.course_id = syncing_course_id
        AND (dq.errors IS NULL OR dq.errors = '');

    -- Second pass: add errors where needed. We'll also fill in everything we
    -- know without needing to know JSON, which is pretty much just the directory
    UPDATE questions AS q
    SET
        directory = dq.qid,
        sync_errors = dq.errors,
        sync_warnings = dq.warnings
    FROM disk_questions AS dq
    WHERE
        q.qid = dq.qid
        AND q.course_id = syncing_course_id
        AND (dq.errors IS NOT NULL AND dq.errors != '');

    -- Make a map from QID to ID to return to the caller
    SELECT
        coalesce(
            jsonb_agg(jsonb_build_array(q.qid, q.id)),
            '[]'::jsonb
        ) AS questions_json
    FROM questions AS q, disk_questions AS dq
    INTO new_questions_json
    WHERE
        q.qid = dq.qid
        AND q.course_id = syncing_course_id;

    -- Ensure that all questions have numbers
    WITH
    questions_needing_numbers AS (
        SELECT
            id, row_number() OVER () AS index
        FROM
            questions
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
    UPDATE
        questions AS q
    SET
        number = qwnn.number
    FROM
        questions_with_new_numbers AS qwnn
    WHERE q.id = qwnn.id;
END;
$$ LANGUAGE plpgsql VOLATILE;
