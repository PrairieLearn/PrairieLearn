CREATE FUNCTION
    variants_ensure_question(
        IN variant_id bigint,
        IN question_id bigint,
        OUT variant variants
    )
AS $$
BEGIN
    SELECT * INTO variant FROM variants WHERE id = variant_id;

    IF variant.question_id IS DISTINCT FROM question_id THEN
        RAISE EXCEPTION 'variant_id = % does not match question_id = %', variant_id, question_id;
    END IF;
END;
$$ LANGUAGE plpgsql VOLATILE;
