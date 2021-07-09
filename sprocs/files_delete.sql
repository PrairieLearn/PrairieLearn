CREATE FUNCTION
    files_delete(
        IN file_id bigint,
        IN authn_user_id bigint
    ) RETURNS void
AS $$
BEGIN
    UPDATE files
    SET
        deleted_by = authn_user_id,
        deleted_at = current_timestamp
    WHERE
        id = file_id;
END;
$$ LANGUAGE plpgsql VOLATILE;
