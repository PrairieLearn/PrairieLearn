DROP FUNCTION IF EXISTS sync_questions(JSONB, bigint);
CREATE OR REPLACE FUNCTION
    sync_questions(
        IN disk_questions_data JSONB[],
        IN syncing_course_id bigint,
        OUT new_questions_json JSONB
    )
AS $$
DECLARE
    missing_question_qids TEXT;
    missing_disk_question_qids TEXT;
    mismatched_uuid_qids TEXT;
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
                   qid,              uuid,                    errors,             warnings,            data
    ) SELECT
        entries->>'qid', (entries->>'uuid')::uuid, entries->>'errors', entries->>'warnings', entries->'data'
    FROM UNNEST(disk_questions_data) AS entries;

    -- Synchronize the dest (questions) with the src
    -- (disk_questions). This soft-deletes, un-soft-deletes, and
    -- inserts new rows in questions. No data is synced yet. Only the
    -- (id, course_id, uuid, qid, deleted_at) columns are used.

    WITH
    matched_rows AS (
        SELECT dq.qid AS dq_qid, dq.uuid AS dq_uuid, q.id AS q_id -- matched_rows cols have underscores
        FROM disk_questions AS dq LEFT JOIN questions AS q ON (
            q.course_id = syncing_course_id
            AND (dq.uuid = q.uuid
                 OR ((dq.uuid IS NULL OR q.uuid IS NULL)
                     AND dq.qid = q.qid AND q.deleted_at IS NULL)))
    ),
    deactivate_unmatched_dest_rows AS (
        UPDATE questions AS q
        SET deleted_at = now()
        WHERE q.id NOT IN (
            SELECT q_id FROM matched_rows WHERE q_id IS NOT NULL
        ) AND q.deleted_at IS NULL AND q.course_id = syncing_course_id
    ),
    update_matched_dest_rows AS (
        UPDATE questions AS q
        SET qid = dq_qid, uuid = dq_uuid, deleted_at = NULL
        FROM matched_rows
        WHERE q.id = q_id AND q.course_id = syncing_course_id
    ),
    insert_unmatched_src_rows AS (
        INSERT INTO questions AS q (course_id, qid, uuid, deleted_at)
        SELECT syncing_course_id, dq_qid, dq_uuid, NULL
        FROM matched_rows
        WHERE q_id IS NULL
        RETURNING q.qid AS dq_qid, q.id AS inserted_q_id
    )
    -- Make a map from QID to ID to return to the caller
    SELECT jsonb_object_agg(dq_qid, COALESCE(q_id, inserted_q_id))
    INTO new_questions_json
    FROM matched_rows LEFT JOIN insert_unmatched_src_rows USING (dq_qid);

    -- Internal consistency checks to ensure that dest (questions) and
    -- src (disk_questions) are in fact synchronized.

    SELECT string_agg(dq.qid, ', ')
    INTO missing_question_qids
    FROM disk_questions AS dq
    WHERE dq.qid NOT IN (SELECT q.qid FROM questions AS q WHERE q.course_id = syncing_course_id AND q.deleted_at IS NULL);
    IF (missing_question_qids IS NOT NULL) THEN
        RAISE EXCEPTION 'Assertion failure: QIDs on disk but not synced to DB: %', missing_question_qids;
    END IF;

    SELECT string_agg(q.qid, ', ')
    INTO missing_disk_question_qids
    FROM questions AS q
    WHERE q.course_id = syncing_course_id AND q.deleted_at IS NULL AND q.qid NOT IN (SELECT dq.qid FROM disk_questions AS dq);
    IF (missing_disk_question_qids IS NOT NULL) THEN
        RAISE EXCEPTION 'Assertion failure: QIDs in DB but not on disk: %', missing_disk_question_qids;
    END IF;

    SELECT string_agg(dq.qid, ', ')
    INTO mismatched_uuid_qids
    FROM disk_questions AS dq JOIN questions AS q ON (q.course_id = syncing_course_id AND q.qid = dq.qid AND q.deleted_at IS NULL)
    WHERE NOT (dq.uuid = q.uuid OR dq.uuid IS NULL);
    IF (mismatched_uuid_qids IS NOT NULL) THEN
        RAISE EXCEPTION 'Assertion failure: QIDs on disk with mismatched UUIDs in DB: %', mismatched_uuid_qids;
    END IF;

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
        -- Aggregates are not allowed in UPDATE clauses, so we need to do them in a
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
