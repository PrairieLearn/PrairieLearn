CREATE OR REPLACE FUNCTION
    slice(
    IN input ANYARRAY,
    IN index_var INTEGER,
    OUT output ANYARRAY
)
AS $$
BEGIN
    SELECT ARRAY (SELECT unnest(input[index_var:index_var])) INTO output;
END;
$$ LANGUAGE plpgsql IMMUTABLE;
