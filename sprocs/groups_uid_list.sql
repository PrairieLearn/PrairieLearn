DROP FUNCTION IF EXISTS group_uid_list(bigint);

CREATE OR REPLACE FUNCTION
    group_uid_list (
        IN group_id bigint
    ) RETURNS text[]
    )
AS $$
BEGIN
    RETURN QUERY
    SELECT array_agg(u.uid)
    FROM
        users AS u
        JOIN group_users AS gu ON (u.user_id = gu.user_id)
    WHERE gu.group_id = g.id
    ORDER BY u.uid;
END
$$ LANGUAGE plpgsql STABLE;
