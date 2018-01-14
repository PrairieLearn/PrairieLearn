DROP TYPE IF EXISTS custom_row CASCADE;
CREATE TYPE custom_row AS (
    element DOUBLE PRECISION[]
);

DROP TYPE IF EXISTS totals CASCADE;
CREATE TYPE totals AS (
    elements custom_row[]
);

CREATE OR REPLACE FUNCTION
    array_agg_custom_sfunc (
    state totals,
    input DOUBLE PRECISION[]
) RETURNS totals AS $$
BEGIN
    state.elements = state.elements || ROW(input)::custom_row;

    RETURN state;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION
    array_agg_custom_ffunc (
    state totals
) RETURNS DOUBLE PRECISION[][] AS $$
DECLARE
    result DOUBLE PRECISION[][];
    num_rows INTEGER;
    num_cols INTEGER;
    iLen INTEGER;
BEGIN
    IF state IS NULL THEN
        RETURN NULL;
    ELSE
        num_rows = array_length(state.elements, 1);
        num_cols = 0;
        FOR i IN 1..num_rows LOOP
            iLen = array_length(state.elements[i].element, 1);
            num_cols = CASE WHEN iLen > num_cols THEN iLen ELSE num_cols END;
        END LOOP;
        result = array_fill(NULL::DOUBLE PRECISION, ARRAY[num_rows, num_cols]);
        FOR i in 1..num_rows LOOP
            FOR j in 1..num_cols LOOP
                result[i][j] = state.elements[i].element[j];
            END LOOP;
        END LOOP;
        RETURN result;
    END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

DROP AGGREGATE IF EXISTS array_agg_custom (DOUBLE PRECISION[]) CASCADE;
CREATE AGGREGATE array_agg_custom (DOUBLE PRECISION[]) (
    SFUNC = array_agg_custom_sfunc,
    STYPE = totals,
    FINALFUNC = array_agg_custom_ffunc
);

