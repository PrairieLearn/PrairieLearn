DROP FUNCTION IF EXISTS group_info(bigint);
CREATE OR REPLACE FUNCTION
    group_info (
        IN assessment_id bigint
    ) RETURNS TABLE (
        id bigint,
        name text,
        uid_list text[]
    )
AS $$
BEGIN
    RETURN QUERY
    SELECT
        gr.id AS id,
        gr.name AS name,
        array_agg(u.uid) AS uid_list
    FROM
        group_configs AS gc
        JOIN groups AS gr ON (gr.group_config_id = gc.id)
        LEFT JOIN group_users AS gu ON (gu.group_id = gr.id)
        LEFT JOIN users AS u ON (u.user_id = gu.user_id)
    WHERE
        gc.deleted_at IS NULL
        AND gr.deleted_at IS NULL
        AND gc.assessment_id = group_info.assessment_id
    GROUP BY
        gr.id;
END
$$ LANGUAGE plpgsql STABLE;
