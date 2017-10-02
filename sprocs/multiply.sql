CREATE OR REPLACE FUNCTION multiply(IN x DOUBLE PRECISION[], IN y DOUBLE PRECISION[], OUT result DOUBLE PRECISION[])
AS $$
BEGIN
    SELECT array_agg(xi * yi) INTO result FROM unnest(x, y) as tmp (xi,yi);
END;
$$ LANGUAGE plpgsql IMMUTABLE;