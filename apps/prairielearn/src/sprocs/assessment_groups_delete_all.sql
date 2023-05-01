CREATE FUNCTION
    assessment_groups_delete_all(
        assessment_id bigint,
        authn_user_id bigint
    ) returns void
AS $$
BEGIN
    WITH log AS (
        UPDATE groups g
        SET deleted_at = NOW()
        WHERE g.id IN (SELECT g.id
                        FROM group_configs AS gc
                        JOIN groups AS g ON g.group_config_id = gc.id
                        WHERE gc.assessment_id = assessment_groups_delete_all.assessment_id 
                        AND g.deleted_at IS NULL
                        AND gc.deleted_at IS NULL)
        RETURNING id
    ) 
    INSERT INTO group_logs 
        (authn_user_id, group_id, action)
    SELECT assessment_groups_delete_all.authn_user_id, id, 'delete'
    FROM log;
END;
$$ LANGUAGE plpgsql VOLATILE;
