CREATE FUNCTION
    variants_ensure_open (
        variant_id bigint
    ) RETURNS void
AS $$
DECLARE
    current_open boolean;
BEGIN
    SELECT open
    INTO current_open
    FROM variants
    WHERE id = variant_id;

    IF NOT FOUND THEN RAISE EXCEPTION 'no such variant_id: %', variant_id USING ERRCODE = 'ST404'; END IF;

    IF NOT current_open THEN RAISE EXCEPTION 'variant is not open: %', variant_id USING ERRCODE = 'ST403'; END IF;
END;
$$ LANGUAGE plpgsql VOLATILE;
