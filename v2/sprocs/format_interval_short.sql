CREATE OR REPLACE FUNCTION format_interval_short(d interval) RETURNS text AS $$
DECLARE
    days integer;
    hours integer;
    mins integer;
    s varchar;
BEGIN
    days := div(CAST(floor(EXTRACT(EPOCH FROM d)) AS integer), 60 * 60 * 24);
    hours := mod(div(CAST(floor(EXTRACT(EPOCH FROM d)) AS integer), 60 * 60), 24);
    mins := mod(div(CAST(floor(EXTRACT(EPOCH FROM d)) AS integer), 60), 60);
    s := '';
    IF days > 0 THEN
        s := s || days::text || 'd';
    END IF;
    IF hours > 0 THEN
        s := s || hours::text || 'h';
    END IF;
    IF mins > 0 THEN
        s := s || mins::text || 'm';
    END IF;
    IF s = '' THEN
        s := '0';
    END IF;
    RETURN s;
END;
$$ LANGUAGE plpgsql;
