CREATE OR REPLACE FUNCTION
    array_div (arr anyarray, divisor double precision) RETURNS double precision[] AS $$
DECLARE new_arr double precision[];
BEGIN
    IF arr IS NULL THEN
        RETURN NULL;
    END IF;

    IF divisor IS NULL THEN
        RETURN NULL;
    END IF;

    FOR i in 1 .. array_length(arr, 1) LOOP
        new_arr[i] = (arr[i]::double precision / divisor);
    END LOOP;

    RETURN new_arr;
END;
$$ LANGUAGE plpgsql IMMUTABLE;