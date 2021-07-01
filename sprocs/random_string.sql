-- a random string generator for a 4-character join code suffix
CREATE FUNCTION
    random_string(
        IN string_length INTEGER,
        IN possible_chars TEXT DEFAULT '0123456789'
    ) RETURNS text
AS $$
DECLARE
    output TEXT = '';
    i INT4;
    pos INT4;
BEGIN
    FOR i IN 1..string_length LOOP
        pos := 1 + CAST( random() * ( LENGTH(possible_chars) - 1) AS INT4 );
        output := output || substr(possible_chars, pos, 1);
    END LOOP;
    RETURN output;
END;
$$ LANGUAGE plpgsql IMMUTABLE;
