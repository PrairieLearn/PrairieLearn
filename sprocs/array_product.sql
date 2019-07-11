CREATE OR REPLACE FUNCTION
    array_product(
        IN x DOUBLE PRECISION[],
        IN y DOUBLE PRECISION[],
        OUT product DOUBLE PRECISION[]
    )
AS $$
BEGIN
    SELECT array_agg(xi * yi) INTO product FROM unnest(x, y) as tmp (xi,yi);
END;
$$ LANGUAGE plpgsql IMMUTABLE;
