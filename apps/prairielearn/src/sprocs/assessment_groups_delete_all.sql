CREATE FUNCTION
    assessment_groups_delete_all(
        assessment_id bigint,
        authn_user_id bigint
    ) returns void
AS $$
BEGIN
    WITH assessment_groups AS (
        SELECT g.id FROM groups AS g
        WHERE g.id IN (SELECT g.id
                        FROM group_configs AS gc
                        JOIN groups AS g ON g.group_config_id = gc.id
                        WHERE gc.assessment_id = assessment_groups_delete_all.assessment_id 
                        AND g.deleted_at IS NULL
                        AND gc.deleted_at IS NULL)
    ), deleted_group_users AS (
        DELETE FROM group_users
        WHERE group_id IN (SELECT id FROM assessment_groups)
        RETURNING user_id, group_id
    ), deleted_group_users_logs AS (
      INSERT INTO group_logs
          (authn_user_id, user_id, group_id, action)
      SELECT
          assessment_groups_delete_all.authn_user_id,
          user_id,
          group_id,
          'leave'
      FROM
          deleted_group_users
    ), deleted_groups AS (
        UPDATE groups AS g
        SET deleted_at = NOW()
        WHERE g.id IN (SELECT id FROM assessment_groups)
        RETURNING id
    )
    INSERT INTO group_logs 
        (authn_user_id, group_id, action)
    SELECT assessment_groups_delete_all.authn_user_id, id, 'delete'
    FROM deleted_groups;
END;
$$ LANGUAGE plpgsql VOLATILE;
