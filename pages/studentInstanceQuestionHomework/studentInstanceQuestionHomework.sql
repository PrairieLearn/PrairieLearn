-- BLOCK get_group_work
SELECT 
    gu.user_id
FROM
    variants as v
    JOIN group_users AS gu ON(v.group_id = gu.group_id)
WHERE
    v.id = $vid;
