CREATE FUNCTION
    random_unique(
        lower INTEGER,
        upper INTEGER, -- may expand range if needed, so true upper bound might be higher than this
        exclude INTEGER[]
    ) RETURNS TABLE(index INTEGER, number INTEGER) AS $$
DECLARE
    lower_bound INTEGER := lower;
    upper_bound INTEGER;
BEGIN
    upper_bound := greatest(upper, lower_bound + 2 * array_length(exclude, 1) + 1);

    RETURN QUERY SELECT (row_number() OVER ())::INTEGER AS index, subq.number AS number
    FROM (SELECT generate_series(lower_bound, upper_bound) EXCEPT SELECT unnest(exclude)) AS subq (number)
    ORDER BY random();
END;
$$ LANGUAGE plpgsql VOLATILE;
