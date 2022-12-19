CREATE FUNCTION
    rubric_gradings_select_data(
        IN arg_assessment_question_id BIGINT,
        IN arg_rubric_id BIGINT,
        IN arg_rubric_grading_id BIGINT,
        OUT rubric_data JSONB,
        OUT rubric_grading_data JSONB,
        OUT rubric_items JSONB
    )
AS $$
BEGIN
    SELECT TO_JSONB(r) INTO rubric_data FROM rubrics r WHERE r.id = arg_rubric_id;
    SELECT TO_JSONB(rg) INTO rubric_grading_data FROM rubric_gradings rg WHERE rg.id = arg_rubric_grading_id;

    WITH submission_count_per_rubric_item AS (
        SELECT
            rgi.rubric_item_id,
            COUNT(1) AS num_submissions
        FROM
            instance_questions iq
            JOIN rubric_gradings rg ON (rg.id IN (iq.manual_rubric_grading_id, iq.auto_rubric_grading_id))
            JOIN rubric_grading_items rgi ON (rgi.rubric_grading_id = rg.id)
        WHERE
            iq.assessment_question_id = arg_assessment_question_id
            AND rg.rubric_id = arg_rubric_id
        GROUP BY rgi.rubric_item_id
    )
    SELECT
        JSONB_AGG(
            JSONB_BUILD_OBJECT(
                'rubric_item', TO_JSONB(ri),
                'grading_item', TO_JSONB(rgi),
                'num_submissions', COALESCE(scpri.num_submissions, 0))
            ORDER BY ri.number, ri.id)
    INTO rubric_items
    FROM
        rubric_items AS ri
        LEFT JOIN submission_count_per_rubric_item AS scpri ON (scpri.rubric_item_id = ri.id)
        LEFT JOIN rubric_grading_items AS rgi ON (rgi.rubric_item_id = ri.id
                                                  AND rgi.rubric_grading_id = arg_rubric_grading_id)
    WHERE
        ri.rubric_id = arg_rubric_id
        AND ri.deleted_at IS NULL;
END;
$$ LANGUAGE plpgsql VOLATILE;
