DROP FUNCTION IF EXISTS jsonb_array_to_double_precision_array(jsonb, double precision[]);

CREATE OR REPLACE FUNCTION
    jsonb_array_to_double_precision_array(
        IN jsonb_array jsonb,
        OUT double_precision_array double precision[]
    )
AS $$
DECLARE
    len integer;
BEGIN
    IF jsonb_array = 'null'::jsonb THEN
        double_precision_array := NULL;
        RETURN;
    END IF;

    len := jsonb_array_length(jsonb_array);

    IF len IS NULL THEN
        double_precision_array := NULL;
    ELSIF len = 0 THEN
        double_precision_array := array[]::double precision[];
    ELSE
        double_precision_array := (SELECT array_agg(v::double precision) FROM jsonb_array_elements_text(jsonb_array) AS v);
    END IF;
END;
$$ LANGUAGE plpgsql VOLATILE;
