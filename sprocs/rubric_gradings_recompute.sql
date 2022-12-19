CREATE FUNCTION
    rubric_gradings_recompute(
        IN old_rubric_grading_id BIGINT,
        OUT rubric_grading_updated BOOLEAN,
        OUT new_rubric_grading_id BIGINT,
        OUT new_computed_points DOUBLE PRECISION
    )
AS $$
DECLARE
    rubric_id BIGINT;
    adjust_points DOUBLE PRECISION;
    applied_rubric_items JSONB;
    rubric_settings_changed BOOLEAN;
    rubric_items_changed BOOLEAN;
BEGIN
    SELECT
        rg.rubric_id,
        rg.adjust_points,
        rg.computed_points,
        rg.starting_points != r.starting_points OR
        rg.max_points != r.max_points OR
        rg.min_points != r.min_points
    INTO
        rubric_id,
        adjust_points,
        new_computed_points,
        rubric_settings_changed
    FROM
        rubric_gradings rg
        JOIN rubrics r ON (r.id = rg.rubric_id)
    WHERE
        rg.id = old_rubric_grading_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Could not find old rubric grading %d.', rubric_grading_id;
    END IF;

    SELECT
        JSONB_AGG(rgi),
        BOOL_OR(ri.id IS NULL OR
                ri.points != rgi.points OR
                ri.deleted_at IS NOT NULL)
    INTO
        applied_rubric_items,
        rubric_items_changed
    FROM
        rubric_grading_items rgi
        LEFT JOIN rubric_items AS ri ON (ri.id = rgi.rubric_item_id)
    WHERE rgi.rubric_grading_id = old_rubric_grading_id;

    IF rubric_settings_changed IS NOT TRUE AND rubric_items_changed IS NOT TRUE THEN
        new_rubric_grading_id := old_rubric_grading_id;
        rubric_grading_updated := FALSE;
    ELSE
        SELECT arg_computed_points, rubric_grading_id, TRUE
        INTO new_computed_points, new_rubric_grading_id, rubric_grading_updated
        FROM rubric_gradings_insert(rubric_id, applied_rubric_items, adjust_points, NULL);
    END IF;
END;
$$ LANGUAGE plpgsql VOLATILE;
