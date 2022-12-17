CREATE FUNCTION
    assessment_questions_update_rubric(
        IN arg_assessment_question_id BIGINT,
        IN rubric_type TEXT,
        IN use_rubrics BOOLEAN,
        IN starting_points DOUBLE PRECISION,
        IN min_points DOUBLE PRECISION,
        IN max_points DOUBLE PRECISION,
        IN arg_rubric_items JSONB,
        IN tag_for_manual_grading BOOLEAN,
        IN arg_authn_user_id BIGINT,
        OUT arg_rubric_id BIGINT
    )
AS $$
DECLARE
    next_number BIGINT := 0;
    rubric_item RECORD;
    assessment_question assessment_questions;
    num_updated_instance_questions BIGINT;
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
                (rubric_id, number, points, short_text,
                 description, staff_instructions, key_binding)
            VALUES
                (arg_rubric_id, next_number, rubric_item.points, rubric_item.short_text,
                 rubric_item.description, rubric_item.staff_instructions,
                 CASE WHEN next_number > 10 THEN NULL ELSE MOD(next_number, 10) END);
        END IF;
    END LOOP;

    WITH new_rubric_gradings AS (
        SELECT iq.*, rgr.*
        FROM
            instance_questions iq
            JOIN rubric_gradings rg ON (rg.id = CASE WHEN rubric_type = 'auto' THEN iq.auto_rubric_grading_id ELSE iq.manual_rubric_grading_id END)
            JOIN rubric_gradings_recompute(rg.id) AS rgr ON TRUE
        WHERE
            iq.assessment_question_id = arg_assessment_question_id
            AND rgr.rubric_grading_updated
    )
    SELECT COUNT(1)
    INTO num_updated_instance_questions
    FROM
        new_rubric_gradings nrg
        JOIN instance_questions_update_score(
                NULL, nrg.assessment_instance_id, -- assessment_id, assessment_instance_id
                NULL, nrg.id, NULL, NULL, NULL, NULL, -- submission, IQ, uid/group, number, qid, modified_at
                NULL, NULL, NULL, NULL, NULL, NULL, -- total/manual/auto score/points
                NULL, NULL, -- feedback, partial scores
                CASE WHEN rubric_type = 'auto' THEN NULL ELSE nrg.new_rubric_grading_id END,
                CASE WHEN rubric_type = 'auto' THEN nrg.new_rubric_grading_id ELSE NULL END,
                arg_authn_user_id) ON TRUE;

    IF tag_for_manual_grading THEN
        UPDATE instance_questions iq
        SET requires_manual_grading = TRUE
        WHERE iq.assessment_question_id = arg_assessment_question_id;
    END IF;
END;
$$ LANGUAGE plpgsql VOLATILE;
