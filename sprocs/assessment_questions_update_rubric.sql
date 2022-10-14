CREATE FUNCTION
    assessment_questions_update_rubric(
        IN assessment_question_id BIGINT,
        IN rubric_type TEXT,
        IN use_rubrics BOOLEAN,
        IN starting_points DOUBLE PRECISION,
        IN min_points DOUBLE PRECISION,
        IN max_points DOUBLE PRECISION,
        OUT rubric_id BIGINT
    )
AS $$
DECLARE
    rubric rubrics;
BEGIN

    SELECT CASE WHEN rubric_type = 'auto' THEN auto_rubric_id ELSE manual_rubric_id END
    INTO rubric_id
    FROM assessment_questions
    WHERE id = assessment_question_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'No such assessment question %', assessment_question_id;
    END IF;

    IF NOT use_rubrics AND rubric_id IS NULL THEN RETURN; END IF;

    IF NOT use_rubrics THEN
        -- PENDING: How to keep a log of this information for future use
        UPDATE assessment_questions
        SET
            manual_rubric_id = CASE WHEN rubric_type = 'auto' THEN manual_rubric_id ELSE NULL END,
            auto_rubric_id = CASE WHEN rubric_type = 'auto' THEN NULL ELSE auto_rubric_id END
        WHERE
            id = assessment_question_id;
    ELSEIF rubric_id IS NULL THEN
        INSERT INTO rubrics
            (starting_points, min_points, max_points)
        VALUES
            (starting_points, min_points, max_points)
        RETURNING id INTO rubric_id;

        UPDATE assessment_questions
        SET
            manual_rubric_id = CASE WHEN rubric_type = 'auto' THEN manual_rubric_id ELSE rubric_id END,
            auto_rubric_id = CASE WHEN rubric_type = 'auto' THEN rubric_id ELSE auto_rubric_id END
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
            id = rubric_id;
    END IF;
END;
$$ LANGUAGE plpgsql VOLATILE;
