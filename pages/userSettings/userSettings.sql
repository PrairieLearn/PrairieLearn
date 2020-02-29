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

-- BLOCK update_dark_mode
UPDATE theme
SET themenum = $dark_mode
WHERE user_id = $user_id;

-- BLOCK select_theme_data
SELECT t.themenum
FROM users as u JOIN theme as t on (t.user_id = u.user_id)
WHERE u.user_id = $user_id;
