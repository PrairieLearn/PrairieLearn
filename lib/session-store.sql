-- BLOCK upsert
INSERT INTO pl_sessions (sid, session, updated_at) VALUES
($sid, $session::jsonb, now())
ON CONFLICT (sid) DO
UPDATE SET session = $session::jsonb, updated_at = now()
;

-- BLOCK get
WITH delete_expired AS (
    DELETE FROM pl_sessions
    WHERE
        sid = $sid
        AND EXTRACT(EPOCH FROM (now() - updated_at)) >= $expirationInSeconds
    RETURNING sid
)
SELECT pl_sessions.*
    FROM pl_sessions
    LEFT JOIN delete_expired USING (sid)
    -- Only return something that isn't in the deleted result
WHERE
    sid = $sid
    AND delete_expired.sid IS NULL
;

-- BLOCK destroy
DELETE FROM pl_sessions WHERE sid = $sid;

-- BLOCK length
SELECT count(*) AS count
FROM pl_sessions
WHERE
    EXTRACT(EPOCH FROM (now() - updated_at)) < $expirationInSeconds
;

-- BLOCK clear
TRUNCATE pl_sessions;

-- BLOCK allsessions
SELECT *
FROM pl_sessions
WHERE
    EXTRACT(EPOCH FROM (now() - updated_at)) < $expirationInSeconds
    -- do this math the other way
ORDER BY sid;
