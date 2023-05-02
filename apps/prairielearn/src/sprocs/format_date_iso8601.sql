CREATE FUNCTION
    format_date_iso8601 (
        d timestamp with time zone,
        display_timezone text
    ) RETURNS text AS $$
BEGIN
    EXECUTE 'SET LOCAL timezone TO ' || quote_literal(coalesce(display_timezone, 'UTC'));
    RETURN to_char(d, 'YYYY-MM-DD') || 'T' || to_char(d, 'HH24:MI:SSOF');
END;
$$ LANGUAGE plpgsql VOLATILE;
