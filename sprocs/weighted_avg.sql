DO $$
BEGIN
    IF NOT EXISTS (select 1 from pg_type where typname = 'weighted_avg_type_1') THEN
        CREATE TYPE weighted_avg_type_1 AS (
          running_sum DOUBLE PRECISION,
          running_count DOUBLE PRECISION
        );
    END IF;
END$$;

CREATE OR REPLACE FUNCTION
    mul_sum2 (
        a weighted_avg_type_1,
        amount DOUBLE PRECISION,
        weight DOUBLE PRECISION
    ) RETURNS weighted_avg_type_1 AS $$
BEGIN
    IF amount IS NULL THEN
        RETURN a;
    ELSE
        IF a IS NULL THEN
            a := (0, 0)::weighted_avg_type_1;
        END IF;
        RETURN (((a.running_sum + (amount * weight)), (a.running_count + weight)))::weighted_avg_type_1;
    END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION
    final_sum2 (
        running_object weighted_avg_type_1
    ) RETURNS DOUBLE PRECISION as $$
BEGIN
    IF running_object.running_count = 0 THEN
        RETURN 0::DOUBLE PRECISION;
    ELSE
        RETURN running_object.running_sum / running_object.running_count;
    END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

DROP AGGREGATE IF EXISTS weighted_avg (DOUBLE PRECISION, DOUBLE PRECISION);
CREATE AGGREGATE weighted_avg (DOUBLE PRECISION, DOUBLE PRECISION) (
    sfunc = mul_sum2,
    finalfunc = final_sum2,
    stype = weighted_avg_type_1
);