CREATE FUNCTION
    submissions_update_parsing(
        submission_id bigint,
        submitted_answer jsonb,
        format_errors jsonb
    ) RETURNS VOID
AS $$
BEGIN
    UPDATE submissions AS s
    SET
        submitted_answer = submissions_update_parsing.submitted_answer,
        format_errors = submissions_update_parsing.format_errors
    WHERE
        s.id = submission_id;

    IF NOT FOUND THEN RAISE EXCEPTION 'submission not found'; END IF;
END;
$$ LANGUAGE plpgsql VOLATILE;
