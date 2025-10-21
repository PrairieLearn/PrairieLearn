CREATE FUNCTION
    array_avg_sfunc (
        state array_and_number,
        input double precision[]
    ) RETURNS array_and_number AS $$
DECLARE
    sums DOUBLE PRECISION[];
    len INTEGER;
BEGIN
    len := GREATEST(COALESCE(array_length(input, 1), 0), array_length(state.arr, 1));
    FOR i IN 1..len LOOP
        sums[i] := COALESCE(state.arr[i], 0) + COALESCE(input[i], 0);
    END LOOP;

    RETURN ROW(sums, COALESCE(state.number, 0) + 1)::array_and_number;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE FUNCTION
    array_avg_ffunc (
        state array_and_number
    ) RETURNS double precision[] AS $$
BEGIN
    IF state IS NULL THEN
        RETURN NULL;
    ELSE
        RETURN (SELECT ARRAY (SELECT unnest(state.arr) / state.number));
    END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE AGGREGATE array_avg (DOUBLE PRECISION[]) (
    sfunc = array_avg_sfunc,
    stype = array_and_number,
    finalfunc = array_avg_ffunc
);
