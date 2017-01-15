CREATE OR REPLACE FUNCTION
    format_date_short (
        d timestamp with time zone
    ) RETURNS text AS $$
BEGIN
    RETURN to_char(d, 'HH24:MI, Dy, Mon FMDD');
END;
$$ LANGUAGE plpgsql IMMUTABLE;
