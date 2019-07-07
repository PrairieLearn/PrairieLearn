-- BLOCK select_user_from_token_hash
SELECT
    to_jsonb(u.*) AS user,
    (adm.id IS NOT NULL) AS is_administrator,
    a.id AS token_id
FROM
    users AS u
    LEFT JOIN administrators AS adm ON (adm.user_id = u.user_id)
    JOIN access_tokens AS a ON (a.user_id = u.user_id)
WHERE
    a.token_hash = $token_hash;

-- BLOCK update_token_last_used
UPDATE
    access_tokens
SET
    last_used_at = NOW()
WHERE
    id = $token_id;
