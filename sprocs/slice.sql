CREATE OR REPLACE FUNCTION
    slice(
    IN input DOUBLE PRECISION[][],
    IN index_var INTEGER,
    OUT output DOUBLE PRECISION[]
)
AS $$
BEGIN
    SELECT ARRAY (SELECT unnest(input[index_var:index_var])) INTO output;
END;
$$ LANGUAGE plpgsql IMMUTABLE;
