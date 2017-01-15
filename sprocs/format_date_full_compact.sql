DROP FUNCTION IF EXISTS format_date_full_compact(timestamp with time zone);
CREATE OR REPLACE FUNCTION
    format_date_full_compact (
        d timestamp with time zone,
        display_timezone text
    ) RETURNS text AS $$
BEGIN
    EXECUTE 'SET LOCAL timezone TO ' || quote_literal(display_timezone);
    RETURN to_char(d, 'YYYY-MM-DD HH24:MI:SS (TZ)');
END;
$$ LANGUAGE plpgsql VOLATILE;
