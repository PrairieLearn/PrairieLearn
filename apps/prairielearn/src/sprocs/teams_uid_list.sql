CREATE FUNCTION
    teams_uid_list (
        IN team_id bigint,
        OUT uid_list text[]
    )
AS $$
BEGIN
    SELECT array_agg(u.uid ORDER BY u.uid)
    INTO uid_list
    FROM
        team_users AS gu
        JOIN users AS u ON (u.id = gu.user_id)
    WHERE gu.team_id = teams_uid_list.team_id;

    uid_list := coalesce(uid_list, '{}');
END
$$ LANGUAGE plpgsql STABLE;
