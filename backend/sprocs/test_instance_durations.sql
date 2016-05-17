CREATE OR REPLACE VIEW test_instance_durations AS
WITH
dates_from_question_views AS (
    SELECT
        ti.id,
        min(a.date) AS min_date,
        max(a.date) AS max_date
    FROM question_views AS qv
    JOIN accesses AS a ON (a.id = qv.access_id)
    JOIN question_instances AS qi ON (qi.id = qv.question_instance_id)
    JOIN test_instances AS ti ON (ti.id = qi.test_instance_id)
    WHERE qv.open AND qv.credit > 0
    GROUP BY ti.id
),
dates_from_submissions AS (
    SELECT
        ti.id,
        min(s.date) AS min_date,
        max(s.date) AS max_date
    FROM submissions AS s
    JOIN question_instances AS qi ON (qi.id = s.question_instance_id)
    JOIN test_instances AS ti ON (ti.id = qi.test_instance_id)
    JOIN users AS u ON (u.id = ti.user_id)
    WHERE u.id = s.auth_user_id
    GROUP BY ti.id
),
-- # TEMPORARILY DISABLE due to "Instructor finish" incorrectly setting the auth_user_id to the user_id
-- dates_from_test_scores AS (
--     SELECT
--         ti.id,
--         min(tsc.date) AS min_date,
--         max(tsc.date) AS max_date
--     FROM test_scores AS tsc
--     JOIN test_instances AS ti ON (ti.id = tsc.test_instance_id)
--     JOIN users AS u ON (u.id = ti.user_id)
--     WHERE u.id = tsc.auth_user_id
--     GROUP BY ti.id
-- ),
all_dates AS (
    SELECT * FROM dates_from_question_views
    UNION ALL
    SELECT * FROM dates_from_submissions
--     UNION ALL
--     SELECT * FROM dates_from_test_scores
)
SELECT
    id,
    min(min_date) AS min_date,
    max(max_date) AS max_date,
    (max(max_date) - min(min_date)) AS duration
FROM all_dates
GROUP BY id
;
