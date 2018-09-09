-- BLOCK select_access_tokens
SELECT
    id,
    name,
    token,
    token_hash,
    format_date_full_compact(created_at, config_select('display_timezone')) AS created_at,
    format_date_full_compact(last_used_at, config_select('display_timezone')) AS last_used_at
FROM
    access_tokens
WHERE
    user_id = $user_id
ORDER BY created_at DESC;

-- BLOCK clear_tokens_for_user
UPDATE access_tokens
SET token = NULL
WHERE user_id = $user_id;
