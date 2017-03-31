CREATE OR REPLACE VIEW assessment_instance_durations AS
WITH
dates_from_assessment_instances AS (
    SELECT
        ai.id,
        ai.date AS min_date,
        ai.date AS max_date
    FROM
        assessment_instances AS ai
),
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
    JOIN users AS u ON (u.user_id = ai.user_id)
    WHERE u.user_id = s.auth_user_id
    GROUP BY ai.id
),
all_dates AS (
    SELECT * FROM dates_from_assessment_instances
    UNION ALL
    SELECT * FROM dates_from_variant_view_logs
    UNION ALL
    SELECT * FROM dates_from_submissions
)
SELECT
    id,
    min(min_date) AS min_date,
    max(max_date) AS max_date,
    (max(max_date) - min(min_date)) AS duration
FROM all_dates
GROUP BY id
;
