CREATE FUNCTION
    format_date_only_no_tz (
        d timestamp with time zone,
        display_timezone text
    ) RETURNS text AS $$
BEGIN
    EXECUTE 'SET LOCAL timezone TO ' || quote_literal(coalesce(display_timezone, 'UTC'));
    RETURN to_char(d, 'YYYY-MM-DD');
END;
$$ LANGUAGE plpgsql VOLATILE;
