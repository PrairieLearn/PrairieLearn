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
            running_sums DOUBLE PRECISION[],
            running_weight_total DOUBLE PRECISION
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
    itemState DOUBLE PRECISION;
BEGIN
    IF nextVal IS NULL THEN
        RETURN state;
    END IF;

    FOR i in 1 .. coalesce(array_length(nextVal, 1), 0) LOOP
        itemState = state.running_sums[i];
        state.running_sums[i] = coalesce(itemState, 0) + nextVal[i] * nextWeight;
    END LOOP;

    state.running_weight_total = coalesce(state.running_weight_total, 0) + nextWeight;

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

    FOR i in 1 .. coalesce(array_length(state.running_sums, 1), 0) LOOP
        result[i] = state.running_sums[i] / state.running_weight_total;
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
