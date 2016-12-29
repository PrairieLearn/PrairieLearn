CREATE OR REPLACE FUNCTION
    format_date_full_compact (
        d timestamp with time zone
    ) RETURNS text AS $$
BEGIN
    RETURN to_char(d, 'YYYY-MM-DD HH24:MI:SS (TZ)');
END;
$$ LANGUAGE plpgsql IMMUTABLE;
