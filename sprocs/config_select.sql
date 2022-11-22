CREATE FUNCTION
    config_select(
        IN key text,
        OUT value text
    )
AS $$
BEGIN
    SELECT c.value
    INTO config_select.value
    FROM config AS c
    WHERE c.key = config_select.key;
END;
$$ LANGUAGE plpgsql VOLATILE;
