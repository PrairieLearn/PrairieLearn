CREATE OR REPLACE FUNCTION
    slice(
    IN input ANYARRAY,
    IN index_var INTEGER,
    OUT output ANYARRAY
)
AS $$
BEGIN
    IF input IS NULL THEN
        output = NULL;
    ELSE
        SELECT ARRAY (SELECT unnest(input[index_var:index_var])) INTO output;
    END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;
