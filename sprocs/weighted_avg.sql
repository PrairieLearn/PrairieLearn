DO $$
BEGIN
    IF NOT EXISTS (select 1 from pg_type where typname = '_weighted_avg_type') THEN
        CREATE TYPE _weighted_avg_type AS (
          running_sum DOUBLE PRECISION,
          running_count DOUBLE PRECISION
        );
    END IF;
END$$;

CREATE OR REPLACE FUNCTION
    mul_sum2 (
        a _weighted_avg_type,
        amount DOUBLE PRECISION,
        weight DOUBLE PRECISION
    ) RETURNS _weighted_avg_type AS $$
BEGIN
    IF amount IS NULL THEN
        RETURN a;
    ELSE
        IF a IS NULL THEN
            a := (0, 0)::_weighted_avg_type;
        END IF;
        RETURN (((a.running_sum + (amount * weight)), (a.running_count + weight)))::_weighted_avg_type;
    END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION
    final_sum2 (
        a _weighted_avg_type
    ) RETURNS DOUBLE PRECISION as $$
BEGIN
    IF a.running_count = 0 THEN
        RETURN 0::DOUBLE PRECISION;
    ELSE
        RETURN a.running_sum / a.running_count;
    END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

DROP AGGREGATE IF EXISTS weighted_avg (DOUBLE PRECISION, DOUBLE PRECISION);
CREATE AGGREGATE weighted_avg (DOUBLE PRECISION, DOUBLE PRECISION) (
    sfunc = mul_sum2,
    finalfunc = final_sum2,
    stype = _weighted_avg_type
);