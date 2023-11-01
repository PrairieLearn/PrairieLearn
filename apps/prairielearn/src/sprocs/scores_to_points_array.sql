CREATE FUNCTION
    scores_to_points_array(
        IN submission_scores DOUBLE PRECISION[],
        IN points_list DOUBLE PRECISION[],
        OUT submission_points DOUBLE PRECISION[]
    )
AS $$
DECLARE
    i integer;
    j integer := 1;
BEGIN
    FOR i in 1..coalesce(cardinality(submission_scores), 0) LOOP
        IF submission_scores[i] IS NULL THEN
            submission_points[i] := NULL;
        ELSE
            submission_points[i] := submission_scores[i] * points_list[j];
            j := j + 1;
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql IMMUTABLE;
