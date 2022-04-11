CREATE FUNCTION
    jsonb_array_to_text_array(
        IN jsonb_array jsonb
    ) RETURNS text[]
AS $$
DECLARE
    len integer;
BEGIN
    IF jsonb_array = 'null'::jsonb THEN
        RETURN NULL;
    END IF;

    len := jsonb_array_length(jsonb_array);

    IF len IS NULL THEN
        RETURN NULL;
    ELSIF len = 0 THEN
        RETURN array[]::text[];
    ELSE
        RETURN (SELECT array_agg(v) FROM jsonb_array_elements_text(jsonb_array) AS v);
    END IF;
END;
$$ LANGUAGE plpgsql VOLATILE;
