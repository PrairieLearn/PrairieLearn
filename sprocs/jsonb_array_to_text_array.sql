DROP FUNCTION IF EXISTS jsonb_array_to_text_array(jsonb, text[]);

CREATE OR REPLACE FUNCTION
    jsonb_array_to_text_array(
        IN jsonb_array jsonb,
        OUT text_array text[]
    )
AS $$
DECLARE
    len integer;
BEGIN
    IF jsonb_array = 'null'::jsonb THEN
        text_array := NULL;
        RETURN;
    END IF;

    len := jsonb_array_length(jsonb_array);

    IF len IS NULL THEN
        text_array := NULL;
    ELSIF len = 0 THEN
        text_array := array[]::text[];
    ELSE
        text_array := (SELECT array_agg(v) FROM jsonb_array_elements_text(jsonb_array) AS tmp(v));
    END IF;
END;
$$ LANGUAGE plpgsql VOLATILE;
