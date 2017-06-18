
-- Based on: https://wiki.postgresql.org/wiki/Aggregate_Histogram

DROP FUNCTION IF EXISTS histogram_sfunc(INTEGER[], REAL, REAL, REAL, INTEGER) CASCADE;
DROP FUNCTION IF EXISTS histogram_sfunc(INTEGER[], DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, INTEGER) CASCADE;

CREATE OR REPLACE FUNCTION
    histogram_sfunc (
        state INTEGER[],
        val DOUBLE PRECISION,
        min DOUBLE PRECISION,
        max DOUBLE PRECISION,
        nbuckets INTEGER
    ) RETURNS INTEGER[] AS $$
DECLARE
    bucket INTEGER;
    is_min_nan BOOLEAN;
BEGIN
    -- Init the array with the correct number of 0's so the caller doesn't see NULLs
    IF state IS NULL THEN
        state := array_fill(0, ARRAY[nbuckets]);
    END IF;

    IF val IS NULL THEN
        RETURN state;
    END IF;

    IF val = 'NaN' THEN
        RETURN state;
    END IF;
    
    -- width_bucket returns values in the range 0 to (nbuckets + 1)
    -- where 0 and (nbuckets + 1) indicate above- and below-range values

    bucket := width_bucket(val, min, max, nbuckets);
    IF bucket IS NOT NULL THEN
        -- clip bucket to allowed range
        bucket := GREATEST(1, LEAST(nbuckets, bucket));
        state[bucket] := state[bucket] + 1;
    END IF;
    
    RETURN state;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Tell Postgres how to use the new function
DROP AGGREGATE IF EXISTS histogram (INTEGER, REAL, REAL, INTEGER) CASCADE;
DROP AGGREGATE IF EXISTS histogram (REAL, REAL, REAL, INTEGER) CASCADE;
DROP AGGREGATE IF EXISTS histogram (DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, INTEGER) CASCADE;
CREATE AGGREGATE histogram (DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, INTEGER) (
    SFUNC = histogram_sfunc,
    STYPE = INTEGER[]
);
