CREATE FUNCTION
    assessment_questions_update_rubric(
        IN assessment_question_id BIGINT,
        IN rubric_type TEXT,
        IN use_rubrics BOOLEAN,
        IN starting_points DOUBLE PRECISION,
        IN min_points DOUBLE PRECISION,
        IN max_points DOUBLE PRECISION,
        IN arg_rubric_items JSONB,
        OUT arg_rubric_id BIGINT
    )
AS $$
DECLARE
    aq_max_points DOUBLE PRECISION;
    next_number BIGINT := 0;
    rubric_item RECORD;
BEGIN

    SELECT
        CASE WHEN rubric_type = 'auto' THEN auto_rubric_id ELSE manual_rubric_id END,
        CASE WHEN rubric_type = 'auto' THEN max_auto_points ELSE max_manual_points END
    INTO
        arg_rubric_id,
        aq_max_points
    FROM assessment_questions
    WHERE id = assessment_question_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'No such assessment question %', assessment_question_id;
    END IF;

    IF NOT use_rubrics AND arg_rubric_id IS NULL THEN RETURN; END IF;

    IF NOT use_rubrics THEN
        -- PENDING: How to keep a log of this information for future use
        UPDATE assessment_questions
        SET
            manual_rubric_id = CASE WHEN rubric_type = 'auto' THEN manual_rubric_id ELSE NULL END,
            auto_rubric_id = CASE WHEN rubric_type = 'auto' THEN NULL ELSE auto_rubric_id END
        WHERE
            id = assessment_question_id;
        RETURN;
    END IF;

    IF arg_rubric_id IS NULL THEN
        INSERT INTO rubrics
            (starting_points, min_points, max_points)
        VALUES
            (starting_points, min_points, max_points)
        RETURNING id INTO arg_rubric_id;

        UPDATE assessment_questions
        SET
            manual_rubric_id = CASE WHEN rubric_type = 'auto' THEN manual_rubric_id ELSE arg_rubric_id END,
            auto_rubric_id = CASE WHEN rubric_type = 'auto' THEN arg_rubric_id ELSE auto_rubric_id END
        WHERE
            id = assessment_question_id;
    ELSE
        UPDATE rubrics
        SET
            starting_points = assessment_questions_update_rubric.starting_points,
            min_points = assessment_questions_update_rubric.min_points,
            max_points = assessment_questions_update_rubric.max_points,
            modified_at = CURRENT_TIMESTAMP
        WHERE
            id = arg_rubric_id;
    END IF;

    FOR rubric_item IN (SELECT *
                        FROM
                            JSONB_TO_RECORDSET(arg_rubric_items) AS ari(
                                id BIGINT,
                                "order" BIGINT,
                                short_text TEXT,
                                points DOUBLE PRECISION,
                                description TEXT,
                                staff_instructions TEXT)
                        ORDER BY ari."order")
    LOOP
        next_number := next_number + 1;

        UPDATE rubric_items
        SET
            number = next_number,
            points = rubric_item.points,
            short_text = COALESCE(rubric_item.short_text, short_text),
            description = COALESCE(rubric_item.description, description),
            staff_instructions = COALESCE(rubric_item.staff_instructions, staff_instructions),
            deleted_at = NULL
        WHERE
            id = rubric_item.id
            AND rubric_id = arg_rubric_id;

        IF NOT FOUND THEN
            INSERT INTO rubric_items
                (rubric_id, number, points, short_text, staff_instructions)
            VALUES
                (arg_rubric_id, next_number, rubric_item.points, rubric_item.short_text, rubric_item.staff_instructions);
        END IF;
    END LOOP;

    -- TODO Recalculate existing instance questions if necessary
    -- TODO Handle issues arising from conflicting changes
END;
$$ LANGUAGE plpgsql VOLATILE;
