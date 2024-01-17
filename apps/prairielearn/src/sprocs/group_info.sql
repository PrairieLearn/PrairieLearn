CREATE FUNCTION
    group_info (
        IN assessment_id bigint
    ) RETURNS TABLE (
        id bigint,
        name text,
        uid_list text[],
        user_name_list text[],
        user_roles_list text[]
    )
AS $$
BEGIN
    RETURN QUERY
    WITH group_user_lists AS (
        SELECT
            g.id as id,
            array_agg(u.uid) AS uid_list,
            array_agg(u.name) AS user_name_list,
            array_agg(users_get_displayed_role(u.user_id, a.course_instance_id)) as user_roles_list
        FROM
            group_configs AS gc
            JOIN assessments AS a ON (a.id = gc.assessment_id)
            JOIN groups AS g ON (g.group_config_id = gc.id)
            JOIN group_users AS gu ON (gu.group_id = g.id)
            JOIN users AS u ON (u.user_id = gu.user_id)
        WHERE
            gc.assessment_id = group_info.assessment_id
            AND gc.deleted_at IS NULL
            AND g.deleted_at IS NULL
        GROUP BY
            g.id
    )
    SELECT
        g.id AS id,
        g.name AS name,
        coalesce(gul.uid_list, '{}'::text[]) AS uid_list,
        coalesce(gul.user_name_list, '{}'::text[]) AS user_name_list,
        coalesce(gul.user_roles_list, '{}'::text[]) AS user_roles_list
    FROM
        group_configs AS gc
        JOIN groups AS g ON (g.group_config_id = gc.id)
        LEFT JOIN group_user_lists AS gul ON (gul.id = g.id)
    WHERE
        gc.assessment_id = group_info.assessment_id
        AND gc.deleted_at IS NULL
        AND g.deleted_at IS NULL;
END
$$ LANGUAGE plpgsql STABLE;
