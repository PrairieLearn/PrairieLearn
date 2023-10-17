
-- Based on: https://wiki.postgresql.org/wiki/Aggregate_Histogram

CREATE FUNCTION
    array_histogram_sfunc (state INTEGER[], val anyelement, thresholds anyarray) RETURNS INTEGER[] AS $$
DECLARE
    nbuckets INTEGER;
    bucket INTEGER;
BEGIN
    nbuckets := array_length(thresholds, 1) - 1;
    -- Init the array with the correct number of 0's so the caller doesn't see NULLs
    IF state IS NULL THEN
        state := array_fill(0, ARRAY[nbuckets]);
    END IF;
    
    -- width_bucket returns values in the range 0 to (nbuckets + 1)
    -- where 0 and (nbuckets + 1) indicate above- and below-range values
    bucket := width_bucket(val, thresholds);
    
    IF bucket IS NOT NULL THEN
        -- clip bucket to allowed range
        bucket := GREATEST(1, LEAST(nbuckets, bucket));
        state[bucket] := state[bucket] + 1;
    END IF;
    
    RETURN state;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Tell Postgres how to use the new function
CREATE AGGREGATE array_histogram (anyelement, anyarray) (
    SFUNC = array_histogram_sfunc,
    STYPE = INTEGER[]
);
