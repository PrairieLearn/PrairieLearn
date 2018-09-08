-- BLOCK select_access_tokens
SELECT
    a.id,
    a.name,
    a.token_hash,
    format_date_full_compact(a.created_at, config_select('display_timezone')) AS created_at
FROM
    access_tokens as a
WHERE
    a.user_id = $user_id
ORDER BY a.created_at DESC;

-- BLOCK insert_access_token
INSERT INTO access_tokens AS a
    (name, user_id, token_hash)
VALUES
    ($name, $user_id, $token_hash);