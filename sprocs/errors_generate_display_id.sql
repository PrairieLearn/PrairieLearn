CREATE OR REPLACE FUNCTION
    errors_generate_display_id() RETURNS text
AS $$
DECLARE
    minval double precision := 1e5;
    maxval double precision := 1e6;
    val double precision;
BEGIN
    val := random() * (maxval - minval) + minval;
    RETURN (val::integer)::text;
END;
$$ LANGUAGE plpgsql VOLATILE;
