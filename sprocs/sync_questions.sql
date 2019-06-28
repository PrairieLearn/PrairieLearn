-- Accepts a course ID and an array of question obects. Ensures that all
-- questions are present and up-to-date in the DB and soft-deletes any
-- questions that are no longer in use by the course. Returns an array
-- of IDs for each created or update question.

CREATE OR REPLACE FUNCTION
    sync_questions(
        IN new_questions JSONB,
        IN new_course_id bigint,
        OUT new_question_ids bigint[]
    )
AS $$
DECLARE
    question JSONB;
    new_question_id bigint;
    client_file text;
    client_files_array text[];
    external_grading_file text;
    external_grading_files_array text[];
BEGIN
    FOR question IN SELECT * FROM JSONB_ARRAY_ELEMENTS(new_questions) LOOP
        -- TODO how to convert from JSON array to postgres array?
        IF question->'client_files' != NULL THEN
            FOR client_file IN SELECT * FROM JSONB_ARRAY_ELEMENTS_TEXT(question->'client_files') LOOP
                client_files_array := array_append(client_files_array, client_file);
            END LOOP;
        END IF;
        IF question->'external_grading_files' != null THEN
            FOR external_grading_file IN SELECT * FROM JSONB_ARRAY_ELEMENTS_TEXT(question->'external_grading_files') LOOP
                external_grading_files_array := array_append(external_grading_files_array, external_grading_file);
            END LOOP;
        END IF;
        INSERT INTO questions
            (uuid,
            qid,
            directory,
            type,
            title,
            options,
            client_files,
            partial_credit,
            course_id,
            grading_method,
            single_variant,
            deleted_at,
            template_directory,
            topic_id,
            external_grading_enabled,
            external_grading_image,
            external_grading_files,
            external_grading_entrypoint,
            external_grading_timeout,
            external_grading_enable_networking)
        (SELECT
            (question->>'uuid')::uuid,
            question->>'qid',
            question->>'qid',
            (question->>'type')::enum_question_type,
            question->>'title',
            (question->'options')::JSONB,
            client_files_array,
            (question->>'partial_credit')::boolean,
            new_course_id,
            (question->>'grading_method')::enum_grading_method,
            (question->>'single_variant')::boolean,
            NULL::timestamp with time zone,
            question->>'template_directory',
            COALESCE((SELECT id FROM topics WHERE name = question->>'topic' AND course_id = new_course_id), NULL),
            (question->>'external_grading_enabled')::boolean,
            question->>'external_grading_image',
            external_grading_files_array,
            question->>'external_grading_entrypoint',
            (question->>'external_grading_timeout')::integer,
            (question->>'external_grading_enable_networking')::boolean
        )
        ON CONFLICT (uuid) DO UPDATE
        SET
            qid = EXCLUDED.qid,
            directory = EXCLUDED.directory,
            type = EXCLUDED.type,
            title = EXCLUDED.title,
            options = EXCLUDED.options,
            client_files = EXCLUDED.client_files,
            partial_credit = EXCLUDED.partial_credit,
            grading_method = EXCLUDED.grading_method,
            single_variant = EXCLUDED.single_variant,
            template_directory = EXCLUDED.template_directory,
            topic_id = EXCLUDED.topic_id,
            deleted_at = EXCLUDED.deleted_at,
            external_grading_enabled = EXCLUDED.external_grading_enabled,
            external_grading_image = EXCLUDED.external_grading_image,
            external_grading_files = EXCLUDED.external_grading_files,
            external_grading_entrypoint = EXCLUDED.external_grading_entrypoint,
            external_grading_timeout = EXCLUDED.external_grading_timeout,
            external_grading_enable_networking = EXCLUDED.external_grading_enable_networking
        WHERE
            questions.course_id = new_course_id
        RETURNING id INTO new_question_id;

        new_question_ids := array_append(new_question_ids, new_question_id);
        client_files_array := array[]::text[];
        external_grading_files_array := array[]::text[];
    END LOOP;

    -- Soft-delete any unused questions
    UPDATE questions AS q
    SET deleted_at = CURRENT_TIMESTAMP
    WHERE
        q.course_id = new_course_id
        AND q.deleted_at IS NULL
        AND q.id NOT IN (SELECT unnest(new_question_ids));

    -- Ensure that all questions have numbers
    WITH
    questions_needing_numbers AS (
        SELECT
            id, row_number() OVER () AS index
        FROM
            questions
        WHERE
            number IS NULL
            AND course_id = new_course_id
        ORDER BY id
    ),
    new_numbers AS (
        SELECT *
        FROM random_unique(100, 1000, (SELECT array_agg(number) FROM questions WHERE course_id = new_course_id))
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
