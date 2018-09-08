-- BLOCK select_access_tokens
SELECT
    id,
    name,
    token,
    token_hash,
    format_date_full_compact(created_at, config_select('display_timezone')) AS created_at
FROM
    access_tokens
WHERE
    user_id = $user_id
ORDER BY created_at DESC;

-- BLOCK insert_access_token
INSERT INTO access_tokens
    (name, user_id, token, token_hash)
VALUES
    ($name, $user_id, $token, $token_hash);

-- BLOCK clear_tokens_for_user
UPDATE access_tokens
SET token = NULL
WHERE user_id = $user_id;

-- BLOCK delete_access_token
DELETE FROM access_tokens
WHERE
    user_id = $user_id
    AND id = $id;
