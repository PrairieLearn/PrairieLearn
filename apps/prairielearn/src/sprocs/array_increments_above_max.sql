CREATE FUNCTION
    array_increments_above_max(
        IN data double precision[],
        OUT increments double precision[]
    )
AS $$
DECLARE
    i integer;
    max_val double precision := 0;
BEGIN
    FOR i in 1..coalesce(cardinality(data), 0) LOOP
        increments[i] := CASE WHEN data[i] IS NULL THEN NULL ELSE greatest(0, data[i] - max_val) END CASE;
        max_val := greatest(max_val, data[i]);
    END LOOP;
END;
$$ LANGUAGE plpgsql VOLATILE;
