CREATE OR REPLACE FUNCTION
    get_upper_bounds(
    IN means DOUBLE PRECISION[],
    IN sds DOUBLE PRECISION[],
    IN num_sds DOUBLE PRECISION,
    OUT upper_bounds DOUBLE PRECISION[]
)
AS $$
BEGIN
    FOR i in 1..array_length(means, 1) LOOP
        upper_bounds[i] = means[i] + num_sds * sds[i];
    END LOOP;
END;
$$ LANGUAGE plpgsql VOLATILE;
