CREATE FUNCTION
    rubric_gradings_insert(
        IN rubric_id BIGINT,
        IN adjust_points DOUBLE PRECISION,
        IN applied_rubric_items JSONB,
        INOUT computed_points DOUBLE PRECISION,
        OUT rubric_grading_id BIGINT
    )
AS $$
DECLARE
    rubric rubrics;
BEGIN
    SELECT * INTO rubric FROM rubrics AS r WHERE r.id = rubric_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Could not find rubric %d.', rubric_id;
    END IF;

    IF computed_points IS NULL THEN
        SELECT LEAST(GREATEST(rubric.starting_points + SUM(COALESCE(ari.score, 1) * ri.points) + COALESCE(adjust_points, 0),
                              rubric.min_points), rubric.max_points)
        INTO computed_points
        FROM JSONB_TO_RECORDSET(applied_rubric_items) AS ari(rubric_item_id BIGINT, score DOUBLE PRECISION, note TEXT)
             JOIN rubric_items AS ri ON (ri.id = ari.rubric_item_id);
    END IF;

    INSERT INTO rubric_gradings
        (rubric_id, computed_points, adjust_points)
    VALUES
        (rubric_id, computed_points, adjust_points)
    RETURNING id INTO rubric_grading_id;

    INSERT INTO rubric_grading_items
        (rubric_grading_id, rubric_item_id, score, note)
    SELECT
        rubric_grading_id, ari.rubric_item_id, COALESCE(ari.score, 1), ari.note
    FROM JSONB_TO_RECORDSET(applied_rubric_items) AS ari(rubric_item_id BIGINT, score DOUBLE PRECISION, note TEXT)
         JOIN rubric_items AS ri ON (ri.id = ari.rubric_item_id);
END;
$$ LANGUAGE plpgsql VOLATILE;
