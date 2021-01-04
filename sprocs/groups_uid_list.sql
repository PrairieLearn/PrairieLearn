DROP FUNCTION IF EXISTS groups_uid_list(bigint);

CREATE OR REPLACE FUNCTION
    groups_uid_list (
        IN group_id bigint,
        OUT uid_list text[]
    )
AS $$
BEGIN
    SELECT array_agg(u.uid ORDER BY u.uid)
    INTO uid_list
    FROM
        group_users AS gu
        JOIN users AS u ON (u.user_id = gu.user_id)
    WHERE gu.group_id = groups_uid_list.group_id;
END
$$ LANGUAGE plpgsql STABLE;
