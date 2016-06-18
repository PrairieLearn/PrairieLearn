-- BLOCK course_tests
SELECT
    t.id,t.number AS test_number,
    ts.number AS test_set_number,ts.color,
    (ts.abbrev || t.number) AS label
FROM tests AS t
JOIN test_sets AS ts ON (ts.id = t.test_set_id)
WHERE t.deleted_at IS NULL
AND t.course_instance_id = $1
ORDER BY (ts.number, t.number);

-- BLOCK user_scores
WITH
course_users AS (
    SELECT u.id,u.uid,u.name AS user_name,e.role
    FROM users AS u
    JOIN enrollments AS e ON (e.user_id = u.id)
    WHERE e.course_instance_id = $1
),
course_tests AS (
    SELECT t.id,t.number AS test_number,ts.number AS test_set_number
    FROM tests AS t
    JOIN test_sets AS ts ON (ts.id = t.test_set_id)
    WHERE t.deleted_at IS NULL
    AND t.course_instance_id = $1
),
user_test_scores AS (
    SELECT u.id AS user_id,u.uid,u.user_name,u.role,
        t.id AS test_id,t.test_number,t.test_set_number,
        MAX(tsc.score_perc) AS score_perc
    FROM course_users AS u
    CROSS JOIN course_tests AS t
    LEFT JOIN (
        test_instances AS ti
        JOIN test_scores AS tsc ON (tsc.test_instance_id = ti.id)
    ) ON (ti.test_id = t.id AND ti.user_id = u.id)
    GROUP BY u.id,u.uid,u.user_name,u.role,t.id,t.test_number,t.test_set_number
)
SELECT user_id,uid,user_name,role,
    ARRAY_AGG(score_perc
          ORDER BY (test_set_number, test_number)
    ) AS scores
FROM user_test_scores
GROUP BY user_id,uid,user_name,role
ORDER BY role DESC, uid;
