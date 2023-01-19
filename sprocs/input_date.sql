CREATE FUNCTION
    input_date (
        date_string text, -- can be either '2016-07-24T16:52:48' or '2016-07-24 16:52:48'
        display_timezone text
    ) RETURNS timestamp with time zone AS $$
DECLARE
    date_parts text[];
    cleaned_date_string text;
BEGIN
    EXECUTE 'SET LOCAL timezone TO ' || quote_literal(display_timezone);

    IF date_string IS NULL THEN
        RETURN NULL;
    END IF;

    date_parts := regexp_matches(date_string, '([0-9]{4}-[0-9]{2}-[0-9]{2})[ T]([0-9]{2}:[0-9]{2}:[0-9]{2})');
    if date_parts IS NULL THEN
        RAISE EXCEPTION 'invalid date format: %, must be like either "2016-07-24T16:52:48" or "2016-07-24 16:52:48"', date_string;
    END IF;
    cleaned_date_string := date_parts[1] || ' ' || date_parts[2];

    RETURN to_timestamp(cleaned_date_string, 'YYYY-MM-DD HH24:MI:SS');
END;
$$ LANGUAGE plpgsql VOLATILE;
