-- BLOCK get_groupwork
SELECT 
    gu.user_id
FROM
    variants as v
    JOIN group_users AS gu ON(v.group_id = gu.group_id)
WHERE
    v.id = $vid;