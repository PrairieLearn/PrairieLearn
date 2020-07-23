CREATE OR REPLACE FUNCTION
    assessment_groups_delete_all(
        assessment_id bigint,
        authn_user_id bigint
    ) returns void
AS $$
BEGIN
    UPDATE groups gr
    SET deleted_at = NOW()
    WHERE gr.id IN (SELECT gr.id
                    FROM group_configs AS gc
                    JOIN groups AS gr ON gr.group_config_id = gc.id
                    WHERE gc.assessment_id = assessment_groups_delete_all.assessment_id 
                    AND gr.deleted_at IS NULL
                    AND gc.deleted_at IS NULL);
END;
$$ LANGUAGE plpgsql VOLATILE;
