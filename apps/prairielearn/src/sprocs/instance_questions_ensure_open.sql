CREATE FUNCTION
    instance_questions_ensure_open (
        instance_question_id bigint
    ) RETURNS void
AS $$
DECLARE
    current_open boolean;
BEGIN
    SELECT open
    INTO current_open
    FROM instance_questions
    WHERE id = instance_question_id;

    IF NOT FOUND THEN RAISE EXCEPTION 'no such instance_question_id: %', instance_question_id USING ERRCODE = 'ST404'; END IF;

    IF NOT current_open THEN RAISE EXCEPTION 'instance question is not open: %', instance_question_id USING ERRCODE = 'ST403'; END IF;
END;
$$ LANGUAGE plpgsql VOLATILE;
