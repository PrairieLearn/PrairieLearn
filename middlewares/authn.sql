-- BLOCK select_user
SELECT
    to_jsonb(u.*) AS user,
    (adm.id IS NOT NULL) AS is_administrator
FROM
    users AS u
    LEFT JOIN administrators AS adm ON (adm.user_id = u.user_id)
WHERE
    u.user_id = $user_id;
