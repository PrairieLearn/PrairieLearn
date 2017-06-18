DO $$
BEGIN
    IF NOT EXISTS (select 1 from pg_type where typname = 'weighted_avg_type') THEN
        CREATE TYPE weighted_avg_type AS (
          running_sum DOUBLE PRECISION,
          running_count DOUBLE PRECISION
        );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'array_weighted_avg_type') THEN
        CREATE TYPE array_weighted_avg_type AS (
            arr weighted_avg_type[]
        );
    END IF;
END
$$;

CREATE OR REPLACE FUNCTION
    mul_sum (
        a weighted_avg_type,
        amount DOUBLE PRECISION,
        weight DOUBLE PRECISION
    ) RETURNS weighted_avg_type AS $$
BEGIN
    IF amount IS NULL THEN
        RETURN a;
    ELSE
        RETURN (((a.running_sum + (amount * weight)), (a.running_count + weight)))::weighted_avg_type;
    END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION
    final_sum (
        a weighted_avg_type
    ) RETURNS DOUBLE PRECISION as $$
BEGIN
    IF a.running_count = 0 THEN
        RETURN 0::DOUBLE PRECISION;
    ELSE
        RETURN a.running_sum / a.running_count;
    END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION
    array_weighted_avg_sfunc (state array_weighted_avg_type, nextVal anyarray, nextWeight double precision) RETURNS array_weighted_avg_type AS $$
DECLARE
    itemState weighted_avg_type;
BEGIN
    IF nextVal IS NULL THEN
        RETURN state;
    END IF;

    IF state IS NULL THEN
        FOR i in 1 .. array_length(nextVal, 1) LOOP
            state.arr[i] = ROW(0, 0);
        END LOOP;
    END IF;

    FOR i in 1 .. array_length(state.arr, 1) LOOP
        itemState = state.arr[i];
        state.arr[i] = mul_sum(itemState, nextVal[i], nextWeight);
    END LOOP;

    RETURN state;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION
    array_weighted_avg_finalfunc(state array_weighted_avg_type) RETURNS double precision[] AS $$
DECLARE
    result DOUBLE PRECISION[];
BEGIN
    IF state IS NULL THEN
        RETURN NULL;
    END IF;

    FOR i in 1 .. array_length(state.arr, 1) LOOP
        result[i] = final_sum(state.arr[i]);
    END LOOP;

    RETURN result;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

DROP AGGREGATE IF EXISTS array_weighted_avg (anyarray, DOUBLE PRECISION) CASCADE;
CREATE AGGREGATE array_weighted_avg (anyarray, DOUBLE PRECISION) (
    sfunc = array_weighted_avg_sfunc,
    stype = array_weighted_avg_type,
    finalfunc = array_weighted_avg_finalfunc
);
