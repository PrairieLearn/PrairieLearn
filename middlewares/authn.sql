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
INSERT INTO users AS u
    ( uid,  name,  uin)
VALUES
    ($uid, $name, $uin)
RETURNING
    u.*;

-- BLOCK update_user
UPDATE users AS u
SET
    name = $name,
    uin = $uin
WHERE
    u.id = $user_id
RETURNING
    u.*;
