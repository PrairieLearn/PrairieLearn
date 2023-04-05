CREATE FUNCTION
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

    uid_list := coalesce(uid_list, '{}');
END
$$ LANGUAGE plpgsql STABLE;
