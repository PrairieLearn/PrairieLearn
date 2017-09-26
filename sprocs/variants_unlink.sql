DROP FUNCTION IF EXISTS variants_unlink(bigint);

CREATE OR REPLACE FUNCTION
    variants_unlink(
        variant_id bigint
    ) RETURNS void
AS $$
BEGIN
    UPDATE variants
    SET instance_question_id = NULL
    WHERE id = variant_id;

    IF NOT FOUND THEN RAISE EXCEPTION 'invalid variant_id'; END IF;
END;
$$ LANGUAGE plpgsql VOLATILE;
