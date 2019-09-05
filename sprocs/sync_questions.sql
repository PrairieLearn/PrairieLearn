-- Accepts a course ID and an array of question obects. Ensures that all
-- questions are present and up-to-date in the DB and soft-deletes any
-- questions that are no longer in use by the course. Returns an array
-- of IDs for each created or update question.

DROP FUNCTION IF EXISTS sync_questions(JSONB, bigint);
CREATE OR REPLACE FUNCTION
    sync_questions(
        IN new_questions JSONB,
        IN new_course_id bigint,
        OUT new_questions_json JSONB
    )
AS $$
DECLARE
    new_question_ids bigint[];
BEGIN
    WITH new_questions AS (
        INSERT INTO questions (
            uuid,
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
            external_grading_enable_networking
        ) SELECT
            (question->>'uuid')::uuid,
            question->>'qid',
            question->>'qid',
            (question->>'type')::enum_question_type,
            question->>'title',
            (question->'options')::JSONB,
            (SELECT ARRAY_AGG(client_files)::text[] FROM JSONB_ARRAY_ELEMENTS_TEXT(COALESCE(question->>'client_files', '[]')::jsonb) client_files)::text[],
            (question->>'partial_credit')::boolean,
            new_course_id,
            (question->>'grading_method')::enum_grading_method,
            (question->>'single_variant')::boolean,
            NULL::timestamp with time zone,
            question->>'template_directory',
            COALESCE((SELECT id FROM topics WHERE name = question->>'topic' AND course_id = new_course_id), NULL),
            (question->>'external_grading_enabled')::boolean,
            question->>'external_grading_image',
            (SELECT ARRAY_AGG(external_grading_files)::text[] FROM JSONB_ARRAY_ELEMENTS_TEXT(COALESCE(question->>'external_grading_files', '[]')::jsonb) external_grading_files)::text[],
            question->>'external_grading_entrypoint',
            (question->>'external_grading_timeout')::integer,
            (question->>'external_grading_enable_networking')::boolean
        FROM JSONB_ARRAY_ELEMENTS(sync_questions.new_questions) AS question
        ON CONFLICT (course_id, uuid) DO UPDATE
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
        RETURNING id, qid
    ),
    questions_json AS (
        SELECT
            coalesce(
                jsonb_agg(jsonb_build_object(
                    'qid', qid,
                    'id', id
                )),
                '[]'::jsonb
            ) AS questions_json
        FROM new_questions
    ),
    question_ids AS (
        SELECT array_agg(id) AS question_ids
        FROM new_questions
    )
    SELECT
        questions_json.questions_json,
        question_ids.question_ids
    FROM questions_json, question_ids
    INTO new_questions_json, new_question_ids;

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
