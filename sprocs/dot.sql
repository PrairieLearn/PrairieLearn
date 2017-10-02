CREATE OR REPLACE FUNCTION dot(IN x DOUBLE PRECISION[], IN y DOUBLE PRECISION[], OUT dot_product DOUBLE PRECISION)
AS $$
BEGIN
    SELECT sum(xi * yi) INTO dot_product FROM unnest(x, y) as tmp (xi,yi);
END;
$$ LANGUAGE plpgsql IMMUTABLE;