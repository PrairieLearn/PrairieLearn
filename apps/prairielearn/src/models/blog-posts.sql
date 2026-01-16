-- BLOCK select_unread_blog_posts_for_user
SELECT
  cbp.*
FROM
  cached_blog_posts cbp
  LEFT JOIN user_blog_read_timestamps ubrt ON ubrt.user_id = $user_id
WHERE
  cbp.pub_date > COALESCE(ubrt.last_read_at, '-infinity'::timestamptz)
ORDER BY
  cbp.pub_date DESC
LIMIT
  $limit;

-- BLOCK upsert_user_blog_read_timestamp
INSERT INTO
  user_blog_read_timestamps (user_id, last_read_at)
VALUES
  ($user_id, now())
ON CONFLICT (user_id) DO UPDATE
SET
  last_read_at = now()
RETURNING
  *;

-- BLOCK upsert_cached_blog_post
INSERT INTO
  cached_blog_posts (title, link, pub_date, guid)
VALUES
  ($title, $link, $pub_date, $guid)
ON CONFLICT (guid) DO UPDATE
SET
  title = EXCLUDED.title,
  link = EXCLUDED.link,
  pub_date = EXCLUDED.pub_date,
  fetched_at = now()
RETURNING
  *;
