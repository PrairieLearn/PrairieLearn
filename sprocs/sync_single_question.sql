
CREATE OR REPLACE FUNCTION
    sync_single_question(
        IN question JSONB,
        IN course_dir text
    ) RETURNS VOID
AS $$
DECLARE
    new_question_id bigint;
    tag text;
    current_course_id bigint;
BEGIN
    SELECT c.id INTO current_course_id
    FROM pl_courses AS c
    WHERE c.path = sync_single_question.course_dir;

    IF NOT FOUND THEN
        -- Something went terribly wrong, abort
        RAISE EXCEPTION 'cound not find course for directory %', course_dir;
    END IF;

    -- Create a missing topic if we need to
    INSERT INTO topics (
        name,
        number,
        color,
        description,
        course_id
    ) VALUES (
        question->>'topic',
        (COALESCE((SELECT MAX(number) FROM topics WHERE course_id = current_course_id), 0) + 1),
        'gray1',
        'Auto-generated from use in a question; add this topic to your courseInfo.json file to customize',
        current_course_id
    ) ON CONFLICT DO NOTHING;

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
    ) VALUES (
        (question->>'uuid')::uuid,
        question->>'qid',
        question->>'qid',
        (question->>'type')::enum_question_type,
        question->>'title',
        (question->'options')::JSONB,
        (SELECT ARRAY_AGG(client_files)::text[] FROM JSONB_ARRAY_ELEMENTS_TEXT(COALESCE(question->>'client_files', '[]')::jsonb) client_files)::text[],
        (question->>'partial_credit')::boolean,
        current_course_id,
        (question->>'grading_method')::enum_grading_method,
        (question->>'single_variant')::boolean,
        NULL::timestamp with time zone,
        question->>'template_directory',
        COALESCE((SELECT id FROM topics WHERE name = question->>'topic' AND course_id = current_course_id), NULL),
        (question->>'external_grading_enabled')::boolean,
        question->>'external_grading_image',
        (SELECT ARRAY_AGG(external_grading_files)::text[] FROM JSONB_ARRAY_ELEMENTS_TEXT(COALESCE(question->>'external_grading_files', '[]')::jsonb) external_grading_files)::text[],
        question->>'external_grading_entrypoint',
        (question->>'external_grading_timeout')::integer,
        (question->>'external_grading_enable_networking')::boolean
    ) ON CONFLICT (course_id, uuid) DO UPDATE
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
    RETURNING id INTO new_question_id;

    -- Create missing tags if needed, add associations between question and tags
    FOR tag IN SELECT * FROM JSONB_ARRAY_ELEMENTS_TEXT(question->'tags') LOOP
        INSERT INTO tags (
            name,
            number,
            color,
            description,
            course_id
        ) VALUES (
            tag,
            (COALESCE((SELECT MAX(number) FROM tags WHERE course_id = current_course_id), 0) + 1),
            'gray1',
            'Auto-generated from use in a question; add this tag to your courseInfo.json file to customize',
            current_course_id
        ) ON CONFLICT DO NOTHING;
    END LOOP;
    INSERT INTO question_tags (
        question_id,
        tag_id
    ) SELECT
        new_question_id,
        (SELECT id FROM tags WHERE name = tag_name AND course_id = current_course_id)
    FROM JSONB_ARRAY_ELEMENTS_TEXT(question->'tags') AS tag_name
    ON CONFLICT (question_id, tag_id) DO NOTHING;

    -- Ensure that all questions have numbers
    -- TODO do we need to do all this all the time?
    WITH
    questions_needing_numbers AS (
        SELECT
            id, row_number() OVER () AS index
        FROM
            questions
        WHERE
            number IS NULL
            AND course_id = current_course_id
        ORDER BY id
    ),
    new_numbers AS (
        SELECT *
        FROM random_unique(100, 1000, (SELECT array_agg(number) FROM questions WHERE course_id = current_course_id))
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
