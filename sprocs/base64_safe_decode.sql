CREATE FUNCTION
    base64_safe_decode(
        IN base64_text text
    ) RETURNS bytea
AS $$
BEGIN
    RETURN decode(base64_text, 'base64');
EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
END;
$$ LANGUAGE plpgsql VOLATILE;
