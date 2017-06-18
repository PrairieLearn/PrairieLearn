CREATE OR REPLACE FUNCTION
    get_lower_bounds(
    IN means DOUBLE PRECISION[],
    IN sds DOUBLE PRECISION[],
    IN num_sds DOUBLE PRECISION,
    OUT lower_bounds DOUBLE PRECISION[]
)
AS $$
BEGIN
    FOR i in 1..array_length(means, 1) LOOP
        lower_bounds[i] = means[i] - num_sds * sds[i];
    END LOOP;
END;
$$ LANGUAGE plpgsql VOLATILE;
