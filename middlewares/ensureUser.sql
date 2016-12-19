-- BLOCK get
SELECT * FROM users WHERE uid = $uid;

-- BLOCK set
INSERT INTO users (uid, name)
VALUES ($uid, $name)
ON CONFLICT (uid) DO UPDATE
SET name = EXCLUDED.name
RETURNING *;
