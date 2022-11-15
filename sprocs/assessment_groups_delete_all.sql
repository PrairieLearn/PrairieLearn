CREATE FUNCTION
    assessment_groups_delete_all(
        arg_assessment_id bigint,
        arg_authn_user_id bigint
    ) returns void
AS $$
BEGIN
    WITH deleted_groups AS (
        UPDATE groups g
        SET deleted_at = NOW()
        WHERE g.id IN (SELECT g.id
                        FROM group_configs AS gc
                        JOIN groups AS g ON g.group_config_id = gc.id
                        WHERE gc.assessment_id = arg_assessment_id 
                        AND g.deleted_at IS NULL
                        AND gc.deleted_at IS NULL)
        RETURNING id
    ),
    related_assessment_instances AS (
        SELECT g.id AS group_id, assessment_instances_delete(ai.id, arg_authn_user_id)
        FROM
            deleted_groups AS g
            JOIN assessment_instances AS ai ON (ai.group_id = g.id)
        WHERE
            ai.assessment_id = arg_assessment_id
            AND ai.deleted_at IS NULL
    )
    INSERT INTO group_logs
        (authn_user_id, group_id, action)
    SELECT
        arg_authn_user_id, g.id, 'delete'
    FROM
        deleted_groups g
        LEFT JOIN related_assessment_instances ai ON (g.id = ai.group_id);
END;
$$ LANGUAGE plpgsql VOLATILE;
