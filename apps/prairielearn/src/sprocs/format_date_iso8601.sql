CREATE FUNCTION
    format_date_iso8601 (
        d timestamp with time zone,
        display_timezone text
    ) RETURNS text AS $$
BEGIN
    EXECUTE 'SET LOCAL timezone TO ' || quote_literal(coalesce(display_timezone, 'UTC'));
    RETURN to_char(d, 'YYYY-MM-DD"T"HH24:MI:SS') ||
           (CASE
                WHEN EXTRACT(TIMEZONE FROM d) >= 0 THEN '+'
                ELSE '-'
            END) ||
           to_char(abs(EXTRACT(TIMEZONE_HOUR FROM d)), 'FM00') || ':' ||
           to_char(abs(EXTRACT(TIMEZONE_MINUTE FROM d)), 'FM00');
END;
$$ LANGUAGE plpgsql VOLATILE;
