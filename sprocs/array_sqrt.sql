CREATE OR REPLACE FUNCTION
    array_sqrt(
        IN x DOUBLE PRECISION[],
        OUT result DOUBLE PRECISION[]
    )
AS $$
BEGIN
    SELECT
        array_agg(sqrt(xi)) AS sqrts
    INTO
        result
    FROM
        unnest(x) AS tmp (xi);
END;
$$ LANGUAGE plpgsql IMMUTABLE;
