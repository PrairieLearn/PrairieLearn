CREATE OR REPLACE FUNCTION
    format_date_full (
        d timestamp with time zone
    ) RETURNS text AS $$
BEGIN
    RETURN to_char(d, 'YYYY-MM-DD HH24:MI:SSOF (TZ)');
END;
$$ LANGUAGE plpgsql IMMUTABLE;
