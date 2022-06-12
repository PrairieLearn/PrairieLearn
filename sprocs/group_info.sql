CREATE FUNCTION
    group_info (
        IN assessment_id bigint
    ) RETURNS TABLE (
        id bigint,
        name text,
        uid_list text[],
        user_name_list text[],
        user_id_list bigint[]
    )
AS $$
BEGIN
    RETURN QUERY
    SELECT
        g.id AS id,
        g.name AS name,
        array_agg(u.uid) AS uid_list,
        array_agg(u.name) AS user_name_list,
        array_agg(u.user_id) as user_id_list
    FROM
        group_configs AS gc
        JOIN groups AS g ON (g.group_config_id = gc.id)
        LEFT JOIN group_users AS gu ON (gu.group_id = g.id)
        LEFT JOIN users AS u ON (u.user_id = gu.user_id)
    WHERE
        gc.deleted_at IS NULL
        AND g.deleted_at IS NULL
        AND gc.assessment_id = group_info.assessment_id
    GROUP BY
        g.id;
END
$$ LANGUAGE plpgsql STABLE;
