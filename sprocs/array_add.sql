CREATE OR REPLACE FUNCTION
    array_add(
        IN x DOUBLE PRECISION[],
        IN y DOUBLE PRECISION[],
        OUT result DOUBLE PRECISION[]
    )
AS $$
BEGIN
    SELECT array_agg(xi + yi) AS sum INTO result FROM unnest(x, y) as tmp (xi,yi);
END;
$$ LANGUAGE plpgsql IMMUTABLE;
