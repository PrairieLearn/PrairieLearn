CREATE OR REPLACE VIEW assessment_instance_durations AS
WITH
dates_from_variant_view_logs AS (
    SELECT
        ai.id,
        min(al.date) AS min_date,
        max(al.date) AS max_date
    FROM variant_view_logs AS vvl
    JOIN access_logs AS al ON (al.id = vvl.access_log_id)
    JOIN variants AS v ON (v.id = vvl.variant_id)
    JOIN instance_questions AS iq ON (iq.id = v.instance_question_id)
    JOIN assessment_instances AS ai ON (ai.id = iq.assessment_instance_id)
    WHERE vvl.open AND vvl.credit > 0
    GROUP BY ai.id
),
dates_from_submissions AS (
    SELECT
        ai.id,
        min(s.date) AS min_date,
        max(s.date) AS max_date
    FROM submissions AS s
    JOIN variants AS v ON (v.id = s.variant_id)
    JOIN instance_questions AS iq ON (iq.id = v.instance_question_id)
    JOIN assessment_instances AS ai ON (ai.id = iq.assessment_instance_id)
    JOIN users AS u ON (u.id = ai.user_id)
    WHERE u.id = s.auth_user_id
    GROUP BY ai.id
),
-- # TEMPORARILY DISABLE due to "Instructor finish" incorrectly setting the auth_user_id to the user_id
-- dates_from_assessment_scores AS (
--     SELECT
--         ai.id,
--         min(tsc.date) AS min_date,
--         max(tsc.date) AS max_date
--     FROM assessment_scores AS tsc
--     JOIN assessment_instances AS ai ON (ai.id = tsc.assessment_instance_id)
--     JOIN users AS u ON (u.id = ai.user_id)
--     WHERE u.id = tsc.auth_user_id
--     GROUP BY ai.id
-- ),
all_dates AS (
    SELECT * FROM dates_from_variant_view_logs
    UNION ALL
    SELECT * FROM dates_from_submissions
--     UNION ALL
--     SELECT * FROM dates_from_assessment_scores
)
SELECT
    id,
    min(min_date) AS min_date,
    max(max_date) AS max_date,
    (max(max_date) - min(min_date)) AS duration
FROM all_dates
GROUP BY id
;
