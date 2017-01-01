-- BLOCK get_user
SELECT
    to_jsonb(u.*) AS user,
    (adm.id IS NOT NULL) AS is_administrator
FROM
    users AS u
    LEFT JOIN administrators AS adm ON (adm.user_id = u.id)
WHERE
    u.uid = $uid;

-- BLOCK insert_user
INSERT INTO users
    ( uid,  name)
VALUES
    ($uid, $name)
ON CONFLICT (uid) DO NOTHING;

-- BLOCK update_name
UPDATE users AS u
SET
    name = $name
WHERE
    u.id = $user_id
RETURNING
    u.*;
