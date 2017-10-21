----------------------------------- ONLINE MEAN -----------------------------------
-- https://en.wikipedia.org/wiki/Algorithms_for_calculating_variance#Online_algorithm

DROP TYPE IF EXISTS mean_and_index CASCADE;
CREATE TYPE mean_and_index AS (mean DOUBLE PRECISION, index DOUBLE PRECISION);

CREATE OR REPLACE FUNCTION online_mean_sfunc (
        prev_mean_and_index mean_and_index,
        input DOUBLE PRECISION
    ) RETURNS mean_and_index AS $$
DECLARE
    prev_mean DOUBLE PRECISION;
    prev_index INTEGER;
    new_index INTEGER;
    new_mean DOUBLE PRECISION;
BEGIN
    IF prev_mean_and_index IS NULL THEN
        RETURN ROW(input, 1)::mean_and_index;
    END IF;

    prev_mean := prev_mean_and_index.mean;
    prev_index := prev_mean_and_index.index;
    new_index := prev_index + 1;
    new_mean := prev_mean + (input - prev_mean) / new_index;

    RETURN ROW(new_mean, new_index)::mean_and_index;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION online_mean_ffunc(
        mean_and_index mean_and_index
    ) RETURNS DOUBLE PRECISION AS $$
BEGIN
    RETURN mean_and_index.mean;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

DROP AGGREGATE IF EXISTS online_mean (DOUBLE PRECISION) CASCADE;
CREATE AGGREGATE online_mean (DOUBLE PRECISION) (
    STYPE = mean_and_index,
    SFUNC = online_mean_sfunc,
    FINALFUNC = online_mean_ffunc
);

-------------------------------- ONLINE VARIANCE --------------------------------
-- https://en.wikipedia.org/wiki/Algorithms_for_calculating_variance#Online_algorithm

DROP TYPE IF EXISTS mean_and_var_and_index CASCADE;
CREATE TYPE mean_and_var_and_index AS (mean DOUBLE PRECISION, variance DOUBLE PRECISION, index DOUBLE PRECISION);

CREATE OR REPLACE FUNCTION online_var_sfunc (
        prev_state mean_and_var_and_index,
        input DOUBLE PRECISION
    ) RETURNS mean_and_var_and_index AS $$
DECLARE
    prev_mean DOUBLE PRECISION;
    prev_variance DOUBLE PRECISION;
    prev_index INTEGER;
    new_index INTEGER;
    new_mean DOUBLE PRECISION;
    new_variance DOUBLE PRECISION;
BEGIN
    IF prev_state IS NULL THEN
        RETURN ROW(input, 0, 1)::mean_and_var_and_index;
    END IF;

    prev_mean := prev_state.mean;
    prev_variance = prev_state.variance;
    prev_index := prev_state.index;
    new_index := prev_index + 1;
    new_mean := prev_mean + (input - prev_mean) / new_index;
    new_variance := (prev_index * prev_variance + (input - prev_mean) * (input - new_mean)) / new_index;

    RETURN ROW(new_mean, new_variance, new_index)::mean_and_var_and_index;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION online_var_ffunc(
        state mean_and_var_and_index
    ) RETURNS DOUBLE PRECISION AS $$
BEGIN
    RETURN state.variance;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

DROP AGGREGATE IF EXISTS online_var (DOUBLE PRECISION) CASCADE;
CREATE AGGREGATE online_var (DOUBLE PRECISION) (
    STYPE = mean_and_var_and_index,
    SFUNC = online_var_sfunc,
    FINALFUNC = online_var_ffunc
);

------------------------------ ONLINE ARRAY VARIANCE ------------------------------
-- https://en.wikipedia.org/wiki/Algorithms_for_calculating_variance#Online_algorithm

CREATE OR REPLACE FUNCTION array_var_sfunc (
        prev_state mean_and_var_and_index[],
        input DOUBLE PRECISION[]
    ) RETURNS mean_and_var_and_index[] AS $$
DECLARE
    new_state mean_and_var_and_index[];
    new_length INTEGER;
    prev_state_i mean_and_var_and_index;
    prev_index INTEGER;
BEGIN
    new_length := GREATEST(array_length(prev_state, 1), array_length(input, 1));
    prev_index := prev_state[1].index;
    FOR i in 1..new_length LOOP
        IF prev_index IS NULL THEN
            prev_state_i := NULL;
        ELSE
            prev_state_i := COALESCE(prev_state[i], ROW(0, 0, prev_index)::mean_and_var_and_index);
        END IF;
        new_state[i] := array_var_sfunc(prev_state_i, COALESCE(input[i], 0));
    END LOOP;

    RETURN new_state;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION array_var_ffunc(
        state mean_and_var_and_index[]
    ) RETURNS DOUBLE PRECISION[] AS $$
DECLARE
    result DOUBLE PRECISION[];
BEGIN
    IF STATE IS NULL THEN
        RETURN NULL;
    END IF;

    FOR i in 1..array_length(state, 1) LOOP
        result[i] = state[i].variance;
    END LOOP;

    RETURN result;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

DROP AGGREGATE IF EXISTS array_var (DOUBLE PRECISION[]) CASCADE;
CREATE AGGREGATE array_var (DOUBLE PRECISION[]) (
    STYPE = mean_and_var_and_index[],
    SFUNC = array_var_sfunc,
    FINALFUNC = array_var_ffunc
);
