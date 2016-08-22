CREATE OR REPLACE VIEW user_test_scores AS
SELECT
    u.id AS user_id,
    t.id AS test_id,
    max(ti.score_perc) AS score_perc
FROM users AS u
JOIN test_instances AS ti ON (ti.user_id = u.id)
JOIN tests AS t ON (t.id = ti.test_id)
WHERE t.deleted_at IS NULL
GROUP BY u.id, t.id;
