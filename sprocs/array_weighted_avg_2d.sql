DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'array_weighted_avg_type_2d') THEN
        CREATE TYPE array_weighted_avg_type_2d AS (
            arr array_weighted_avg_type[]
        );
    END IF;
END
$$;

CREATE OR REPLACE FUNCTION
    array_weighted_avg_sfunc_2d (
    state array_weighted_avg_type_2d,
    nextVal anyarray,
    nextWeight double precision
) RETURNS array_weighted_avg_type_2d AS $$
DECLARE
    sub_result array_weighted_avg_type;
    sub_input DOUBLE PRECISION[];
BEGIN
    IF nextVal IS NULL THEN
        RETURN state;
    END IF;

    FOR i in 1..coalesce(array_length(nextVal, 1), 0) LOOP
        SELECT ARRAY (SELECT unnest(nextVal[i:i])) INTO sub_input;
        sub_result = array_weighted_avg_sfunc(state.arr[i], sub_input, nextWeight);
        state.arr[i] = sub_result;
    END LOOP;

    RETURN state;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION
    array_weighted_avg_finalfunc_2d(state array_weighted_avg_type_2d) RETURNS double precision[] AS $$
DECLARE
    result DOUBLE PRECISION[][];
    num_rows INTEGER;
    num_cols INTEGER;
    sub_result DOUBLE PRECISION[];
BEGIN
    IF state IS NULL THEN
        RETURN NULL;
    END IF;

    num_rows = coalesce(array_length(state.arr, 1), 0);
    num_cols = 0;
    FOR i in 1..num_rows LOOP
        num_cols = greatest(num_cols, coalesce(array_length(state.arr[i].running_sums, 1), 0));
    END LOOP;

    result = array_fill(NULL::DOUBLE PRECISION, ARRAY[num_rows, num_cols]);

    FOR i in 1..coalesce(array_length(state.arr, 1), 0) LOOP
        sub_result = array_weighted_avg_finalfunc(state.arr[i]);

        FOR j in 1..coalesce(array_length(sub_result, 1), 0) LOOP
            result[i][j] = sub_result[j];
        END LOOP;
    END LOOP;

    RETURN result;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

DROP AGGREGATE IF EXISTS array_weighted_avg_2d (anyarray, DOUBLE PRECISION) CASCADE;
CREATE AGGREGATE array_weighted_avg_2d (anyarray, DOUBLE PRECISION) (
    sfunc = array_weighted_avg_sfunc_2d,
    stype = array_weighted_avg_type_2d,
    finalfunc = array_weighted_avg_finalfunc_2d
);
