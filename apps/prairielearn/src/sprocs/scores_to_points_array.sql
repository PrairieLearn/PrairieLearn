CREATE FUNCTION
    scores_to_points_array(
        IN x DOUBLE PRECISION[],
        IN y DOUBLE PRECISION[],
        OUT product DOUBLE PRECISION[]
    )
AS $$
DECLARE
    i integer;
    j integer := 1;
BEGIN
    FOR i in 1..coalesce(cardinality(x), 0) LOOP
        IF x[i] IS NULL THEN
            product[i] := NULL;
        ELSE
            product[i] := x[i] * y[j];
            j := j + 1;
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql IMMUTABLE;
