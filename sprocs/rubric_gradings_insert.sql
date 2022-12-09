CREATE FUNCTION
    rubric_gradings_insert(
        IN rubric_id              BIGINT,
        IN applied_rubric_items   JSONB,
        IN arg_adjust_points      DOUBLE PRECISION,
        INOUT arg_computed_points DOUBLE PRECISION,
        OUT rubric_grading_id     BIGINT
    )
AS $$
DECLARE
    rubric rubrics;
    sum_rubric_item_points DOUBLE PRECISION;
BEGIN
    SELECT * INTO rubric FROM rubrics AS r WHERE r.id = rubric_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Could not find rubric %d.', rubric_id;
    END IF;

    SELECT LEAST(GREATEST(rubric.starting_points +
                          COALESCE(SUM(COALESCE(ari.score, 1) * ri.points), 0) +
                          COALESCE(arg_adjust_points, 0), rubric.min_points), rubric.max_points)
    INTO sum_rubric_item_points
    FROM JSONB_TO_RECORDSET(applied_rubric_items) AS ari(rubric_item_id BIGINT, score DOUBLE PRECISION, note TEXT)
         JOIN rubric_items AS ri ON (ri.id = ari.rubric_item_id AND ri.rubric_id = rubric.id);

    INSERT INTO rubric_gradings
        (rubric_id, computed_points, adjust_points, starting_points, max_points, min_points)
    VALUES
        (rubric_id, COALESCE(arg_computed_points, sum_rubric_item_points),
         COALESCE(arg_adjust_points, arg_computed_points - sum_rubric_item_points, 0),
         rubric.starting_points, rubric.max_points, rubric.min_points)
    RETURNING id, computed_points INTO rubric_grading_id, arg_computed_points;

    INSERT INTO rubric_grading_items
        (rubric_grading_id, rubric_item_id, score, points, short_text, note)
    SELECT
        rubric_grading_id, ari.rubric_item_id, COALESCE(ari.score, 1), COALESCE(ari.score, 1) * ri.points, ri.short_text, ari.note
    FROM JSONB_TO_RECORDSET(applied_rubric_items) AS ari(rubric_item_id BIGINT, score DOUBLE PRECISION, note TEXT)
         JOIN rubric_items AS ri ON (ri.id = ari.rubric_item_id AND ri.rubric_id = rubric.id);
END;
$$ LANGUAGE plpgsql VOLATILE;
