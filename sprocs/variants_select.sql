CREATE OR REPLACE FUNCTION
    variants_select (
        IN variant_id bigint,
        OUT variant variants
    )
AS $$
BEGIN
    SELECT *
    INTO variant
    FROM variants
    WHERE id = variant_id;

    IF NOT FOUND THEN RAISE EXCEPTION 'no such variant_id: %', variant_id; END IF;
END;
$$ LANGUAGE plpgsql VOLATILE;
