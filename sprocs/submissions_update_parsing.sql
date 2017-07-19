CREATE OR REPLACE FUNCTION
    submissions_update_parsing(
        IN submission_id bigint,
        IN submitted_answer jsonb,
        IN parse_errors jsonb
    ) RETURNS VOID
AS $$
BEGIN
    UPDATE submissions AS s
    SET
        submitted_answer = submissions_update_parsing.submitted_answer,
        parse_errors = submissions_update_parsing.parse_errors
    WHERE
        s.id = submission_id;

    IF NOT FOUND THEN RAISE EXCEPTION 'submission not found'; END IF;
END;
$$ LANGUAGE plpgsql VOLATILE;
