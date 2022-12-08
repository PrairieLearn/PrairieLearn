CREATE FUNCTION
    assessment_questions_update_rubric(
        IN arg_assessment_question_id BIGINT,
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
    next_number BIGINT := 0;
    rubric_item RECORD;
    assessment_question assessment_questions;
BEGIN

    SELECT * INTO assessment_question
    FROM assessment_questions
    WHERE id = arg_assessment_question_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'No such assessment question %', arg_assessment_question_id;
    END IF;

    arg_rubric_id := CASE WHEN rubric_type = 'auto' THEN assessment_question.auto_rubric_id ELSE assessment_question.manual_rubric_id END;

    IF NOT use_rubrics AND arg_rubric_id IS NULL THEN RETURN; END IF;

    IF NOT use_rubrics THEN
        -- PENDING: How to keep a log of this information for future use
        UPDATE assessment_questions
        SET
            manual_rubric_id = CASE WHEN rubric_type = 'auto' THEN manual_rubric_id ELSE NULL END,
            auto_rubric_id = CASE WHEN rubric_type = 'auto' THEN NULL ELSE auto_rubric_id END
        WHERE
            id = arg_assessment_question_id;
        arg_rubric_id := NULL;
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
            id = arg_assessment_question_id;
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
            key_binding = CASE WHEN next_number > 10 THEN NULL ELSE MOD(next_number, 10) END,
            deleted_at = NULL
        WHERE
            id = rubric_item.id
            AND rubric_id = arg_rubric_id;

        IF NOT FOUND THEN
            INSERT INTO rubric_items
                (rubric_id, number, points, short_text, staff_instructions, key_binding)
            VALUES
                (arg_rubric_id, next_number, rubric_item.points, rubric_item.short_text, rubric_item.staff_instructions, CASE WHEN next_number > 10 THEN NULL ELSE MOD(next_number, 10) END);
        END IF;
    END LOOP;

    -- TODO Do this only for instance questions that have rubric items
    -- that have been affected by a change, depending on options
    WITH updated_instance_questions AS (
        UPDATE instance_questions iq
        SET
            manual_points = CASE WHEN rubric_type = 'auto' THEN manual_points ELSE rgi.arg_computed_points END,
            auto_points = CASE WHEN rubric_type = 'auto' THEN rgi.arg_computed_points ELSE auto_points END,
            manual_rubric_grading_id = CASE WHEN rubric_type = 'auto' THEN manual_rubric_grading_id ELSE rgi.rubric_grading_id END,
            auto_rubric_grading_id = CASE WHEN rubric_type = 'auto' THEN rgi.rubric_grading_id ELSE auto_rubric_grading_id END,
            points = CASE WHEN rubric_type = 'auto' THEN manual_points ELSE auto_points END + rgi.arg_computed_points
            -- TODO score_perc, highest_submission_score (maybe use instance_questions_update_score?)
        FROM
            rubric_gradings AS rg
            JOIN rubric_gradings_insert(arg_rubric_id, rg.id, NULL, NULL, NULL) AS rgi ON TRUE
        WHERE
            iq.assessment_question_id = arg_assessment_question_id
            AND rg.id = CASE WHEN rubric_type = 'auto' THEN iq.auto_rubric_grading_id ELSE iq.manual_rubric_grading_id END
        RETURNING iq.*
    )
    INSERT INTO question_score_logs
        (instance_question_id, auth_user_id,
        max_points, max_manual_points, max_auto_points,
        points, score_perc, auto_points, manual_points)
    SELECT
        iq.id, 1, -- TODO Add auth_user_id as argument
        assessment_question.max_points, assessment_question.max_manual_points, assessment_question.max_auto_points,
        iq.points, iq.score_perc, iq.auto_points, iq.manual_points
    FROM
        updated_instance_questions iq;

    -- TODO Add grading job?
    -- TODO Handle issues arising from conflicting changes
END;
$$ LANGUAGE plpgsql VOLATILE;
