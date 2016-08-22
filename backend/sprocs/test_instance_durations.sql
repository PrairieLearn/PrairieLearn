CREATE OR REPLACE VIEW test_instance_durations AS
WITH
dates_from_variant_view_logs AS (
    SELECT
        ti.id,
        min(al.date) AS min_date,
        max(al.date) AS max_date
    FROM variant_view_logs AS vvl
    JOIN access_logs AS al ON (al.id = vvl.access_log_id)
    JOIN variants AS v ON (v.id = vvl.variant_id)
    JOIN instance_questions AS iq ON (iq.id = v.instance_question_id)
    JOIN test_instances AS ti ON (ti.id = iq.test_instance_id)
    WHERE vvl.open AND vvl.credit > 0
    GROUP BY ti.id
),
dates_from_submissions AS (
    SELECT
        ti.id,
        min(s.date) AS min_date,
        max(s.date) AS max_date
    FROM submissions AS s
    JOIN variants AS v ON (v.id = s.variant_id)
    JOIN instance_questions AS iq ON (iq.id = v.instance_question_id)
    JOIN test_instances AS ti ON (ti.id = iq.test_instance_id)
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
    SELECT * FROM dates_from_variant_view_logs
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
