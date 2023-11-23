CREATE FUNCTION
    format_date_short (
        d timestamp with time zone,
        display_timezone text
    ) RETURNS text AS $$
BEGIN
    EXECUTE 'SET LOCAL timezone TO ' || quote_literal(coalesce(display_timezone, 'UTC'));
    RETURN to_char(d, 'HH24:MI, Dy, Mon FMDD');
END;
$$ LANGUAGE plpgsql VOLATILE;
