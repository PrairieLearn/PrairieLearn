CREATE OR REPLACE FUNCTION
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
        increments[i] := greatest(0, data[i] - max_val);
        max_val := greatest(max_val, data[i]);
    END LOOP;
END;
$$ LANGUAGE plpgsql VOLATILE;
