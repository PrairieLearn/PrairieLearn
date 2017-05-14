-- BLOCK select_user
SELECT
    to_jsonb(u.*) AS user,
    (adm.id IS NOT NULL) AS is_administrator
FROM
    users AS u
    LEFT JOIN administrators AS adm ON (adm.user_id = u.user_id)
WHERE
    u.user_id = $user_id;

-- BLOCK insert_user
WITH insert_result AS (
    INSERT INTO users
        (uid, name, uin, provider)
    VALUES
        ($uid, $name, $uin, $provider)
    ON CONFLICT (uid) DO UPDATE
    SET
        uid = EXCLUDED.uid,
        name = EXCLUDED.name,
        uin = EXCLUDED.uin,
        provider = EXCLUDED.provider
    RETURNING *
)
SELECT
    to_jsonb(u.*) AS user,
    (adm.id IS NOT NULL) AS is_administrator
FROM
    insert_result AS u
    LEFT JOIN administrators AS adm ON (adm.user_id = u.user_id);
