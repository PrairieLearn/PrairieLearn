CREATE FUNCTION
    team_info (
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
    WITH team_user_lists AS (
        SELECT
            t.id as id,
            array_agg(u.uid) AS uid_list,
            array_agg(u.name) AS user_name_list,
            array_agg(users_get_displayed_role(u.id, a.course_instance_id)) as user_roles_list
        FROM
            team_configs AS tc
            JOIN assessments AS a ON (a.id = tc.assessment_id)
            JOIN teams AS t ON (t.team_config_id = tc.id)
            JOIN team_users AS tu ON (tu.team_id = t.id)
            JOIN users AS u ON (u.id = tu.user_id)
        WHERE
            tc.assessment_id = team_info.assessment_id
            AND tc.deleted_at IS NULL
            AND t.deleted_at IS NULL
        GROUP BY
            t.id
    )
    SELECT
        t.id AS id,
        t.name AS name,
        coalesce(tul.uid_list, '{}'::text[]) AS uid_list,
        coalesce(tul.user_name_list, '{}'::text[]) AS user_name_list,
        coalesce(tul.user_roles_list, '{}'::text[]) AS user_roles_list
    FROM
        team_configs AS tc
        JOIN teams AS t ON (t.team_config_id = tc.id)
        LEFT JOIN team_user_lists AS tul ON (tul.id = t.id)
    WHERE
        tc.assessment_id = team_info.assessment_id
        AND tc.deleted_at IS NULL
        AND t.deleted_at IS NULL;
END
$$ LANGUAGE plpgsql STABLE;
