CREATE OR REPLACE FUNCTION
    assessment_groups_delete_group(
        assessment_id bigint,
        arg_gid bigint
    ) RETURNS void
AS $$
BEGIN
    -- ##################################################################
    -- soft delete a group
    UPDATE groups
    SET deleted_at = NOW()
    WHERE id = arg_gid;

END;
$$ LANGUAGE plpgsql VOLATILE;
