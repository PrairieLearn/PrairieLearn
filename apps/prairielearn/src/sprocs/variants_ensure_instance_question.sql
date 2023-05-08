CREATE FUNCTION
    variants_ensure_instance_question(
        IN variant_id bigint,
        IN instance_question_id bigint,
        OUT variant variants
    )
AS $$
BEGIN
    SELECT * INTO variant FROM variants WHERE id = variant_id;

    IF variant.instance_question_id IS DISTINCT FROM instance_question_id THEN
        RAISE EXCEPTION 'variant_id = % does not match instance_question_id = %', variant_id, instance_question_id;
    END IF;
END;
$$ LANGUAGE plpgsql VOLATILE;
