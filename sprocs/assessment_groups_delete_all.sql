CREATE OR REPLACE FUNCTION
    assessment_groups_delete_all(
        assessment_id bigint,
        authn_user_id bigint
    ) returns void
AS $$
BEGIN
    DELETE FROM group_users gu
    WHERE gu.group_id IN (SELECT gr.id
                        FROM group_configs AS gc
                        JOIN groups AS gr ON gr.group_config_id = gc.id
                        WHERE gc.assessment_id = assessment_groups_delete_all.assessment_id);

    DELETE FROM groups g
    WHERE g.id IN (SELECT gr.id
                FROM group_configs AS gc
                JOIN groups AS gr ON gr.group_config_id = gc.id
                WHERE gc.assessment_id = assessment_groups_delete_all.assessment_id);
END;
$$ LANGUAGE plpgsql VOLATILE;
