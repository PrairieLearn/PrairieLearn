CREATE OR REPLACE VIEW student_test_scores AS
SELECT
    u.id AS user_id,
    t.id AS test_id,
    max(ti.score_perc) AS score_perc
FROM
    users AS u
    JOIN test_instances AS ti ON (ti.user_id = u.id)
    JOIN tests AS t ON (t.id = ti.test_id)
    JOIN enrollments AS e ON (e.user_id = u.id AND e.course_instance_id = t.course_instance_id)
WHERE
    t.deleted_at IS NULL
    AND e.role = 'Student'
GROUP BY u.id, t.id
;
