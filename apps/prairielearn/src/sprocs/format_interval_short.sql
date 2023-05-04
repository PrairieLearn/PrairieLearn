CREATE FUNCTION format_interval_short(d interval) RETURNS text AS $$
DECLARE
    days integer;
    hours integer;
    mins integer;
    secs integer;
    s text;
BEGIN
    days := div(CAST(floor(DATE_PART('epoch', d)) AS integer), 60 * 60 * 24);
    hours := mod(div(CAST(floor(DATE_PART('epoch', d)) AS integer), 60 * 60), 24);
    mins := mod(div(CAST(floor(DATE_PART('epoch', d)) AS integer), 60), 60);
    secs := mod(CAST(floor(DATE_PART('epoch', d)) AS integer), 60);
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
    IF secs > 0 THEN
        s := s || secs::text || 's';
    END IF;
    IF s = '' THEN
        s := '0';
    END IF;
    RETURN s;
END;
$$ LANGUAGE plpgsql IMMUTABLE;
