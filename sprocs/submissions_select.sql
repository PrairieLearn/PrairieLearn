CREATE FUNCTION
    submissions_select (
        IN submission_id bigint,
        OUT submission submissions
    )
AS $$
BEGIN
    SELECT *
    INTO submission
    FROM submissions
    WHERE id = submission_id;

    IF NOT FOUND THEN RAISE EXCEPTION 'no such submission_id: %', submission_id; END IF;
END;
$$ LANGUAGE plpgsql VOLATILE;
