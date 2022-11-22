CREATE FUNCTION
    format_date_full (
        d timestamp with time zone,
        display_timezone text
    ) RETURNS text AS $$
BEGIN
    EXECUTE 'SET LOCAL timezone TO ' || quote_literal(coalesce(display_timezone, 'UTC'));
    RETURN to_char(d, 'YYYY-MM-DD HH24:MI:SSOF (TZ)');
END;
$$ LANGUAGE plpgsql VOLATILE;
