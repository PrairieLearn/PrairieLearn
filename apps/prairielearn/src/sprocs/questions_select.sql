CREATE FUNCTION
    questions_select (
        IN question_id bigint,
        OUT question questions
    )
AS $$
BEGIN
    SELECT *
    INTO question
    FROM questions
    WHERE id = question_id;

    IF NOT FOUND THEN RAISE EXCEPTION 'no such question_id: %', question_id; END IF;
END;
$$ LANGUAGE plpgsql VOLATILE;
