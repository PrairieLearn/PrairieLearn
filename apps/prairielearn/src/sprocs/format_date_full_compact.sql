CREATE FUNCTION
    format_date_full_compact (
        d timestamp with time zone,
        display_timezone text
    ) RETURNS text AS $$
DECLARE
    e text;
BEGIN
    EXECUTE 'SET LOCAL timezone TO ' || quote_literal(coalesce(display_timezone, 'UTC'));
    RETURN to_char(d, 'YYYY-MM-DD HH24:MI:SS (TZ)');
END;
$$ LANGUAGE plpgsql VOLATILE;
