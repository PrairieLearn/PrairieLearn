CREATE OR REPLACE FUNCTION
    array_avg_sfunc (
        state array_and_number,
        input DOUBLE PRECISION[]
    ) RETURNS array_and_number AS $$
DECLARE
    sums DOUBLE PRECISION[];
    len INTEGER;
BEGIN
    len = GREATEST(array_length(input, 1), array_length(state.arr, 1));
    FOR i IN 1..len LOOP
        sums[i] := COALESCE(state.arr[i], 0) + COALESCE(input[i], 0);
    END LOOP;

    RETURN ROW(sums, COALESCE(state.number, 0) + 1)::array_and_number;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION
    array_avg_ffunc (
        state array_and_number
    ) RETURNS DOUBLE PRECISION[] AS $$
BEGIN
    IF state IS NULL THEN
        RETURN NULL;
    ELSE
        RETURN (SELECT ARRAY (SELECT unnest(state.arr) / state.number));
    END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

DROP AGGREGATE IF EXISTS array_avg (DOUBLE PRECISION[]) CASCADE;
CREATE AGGREGATE array_avg (DOUBLE PRECISION[]) (
    SFUNC = array_avg_sfunc,
    STYPE = array_and_number,
    FINALFUNC = array_avg_ffunc
);
