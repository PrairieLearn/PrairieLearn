-- BLOCK select_user_from_token_hash
SELECT
    to_jsonb(u.*) AS user,
    (adm.id IS NOT NULL) AS is_administrator
FROM
    users AS u
    LEFT JOIN administrators AS adm ON (adm.user_id = u.user_id)
    JOIN access_tokens AS a ON (a.user_id = u.user_id)
WHERE
    a.token_hash = $token_hash;