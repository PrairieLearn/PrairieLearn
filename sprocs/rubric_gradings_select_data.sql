CREATE FUNCTION
    rubric_gradings_select_data(
        IN rubric_id BIGINT,
        IN rubric_grading_id BIGINT,
        OUT rubric_data JSONB,
        OUT rubric_grading_data JSONB,
        OUT rubric_items JSONB
    )
AS $$
BEGIN
    SELECT TO_JSONB(r) INTO rubric_data FROM rubrics r WHERE r.id = rubric_id;
    SELECT TO_JSONB(rg) INTO rubric_grading_data FROM rubric_gradings rg WHERE rg.id = rubric_grading_id;

    SELECT
        JSONB_AGG(
            JSONB_BUILD_OBJECT(
                'rubric_item', TO_JSONB(ri),
                'grading_item', TO_JSONB(rgi))
            ORDER BY ri.number, ri.id)
    INTO rubric_items
    FROM
        rubric_items AS ri
        LEFT JOIN rubric_grading_items AS rgi ON (rgi.rubric_item_id = ri.id AND rgi.rubric_grading_id = rubric_gradings_select_data.rubric_grading_id AND rgi.deleted_at IS NULL)
    WHERE
        ri.rubric_id = rubric_gradings_select_data.rubric_id
        AND ri.deleted_at IS NULL;
END;
$$ LANGUAGE plpgsql VOLATILE;
