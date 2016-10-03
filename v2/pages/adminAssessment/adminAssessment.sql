-- BLOCK select_and_auth
SELECT
    to_jsonb(a) AS assessment,
    to_jsonb(aset) AS assessment_set
FROM
    assessments AS a
    JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
    JOIN LATERAL authz_assessment(a.id, $authz_data) AS aa ON TRUE
WHERE
    a.id = $assessment_id
    AND aa.authorized;

-- BLOCK questions
SELECT
    aq.*,q.qid,q.title,row_to_json(top) AS topic,
    z.title AS zone_title,z.number AS zone_number,
    (lag(z.id) OVER (PARTITION BY z.id ORDER BY aq.number) IS NULL) AS start_new_zone,
    assessments_for_question(q.id,ci.id,a.id) AS assessments
FROM
    assessment_questions AS aq
    JOIN questions AS q ON (q.id = aq.question_id)
    JOIN zones AS z ON (z.id = aq.zone_id)
    JOIN topics AS top ON (top.id = q.topic_id)
    JOIN assessments AS a ON (a.id = aq.assessment_id)
    JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
WHERE
    a.id = $assessment_id
    AND aq.deleted_at IS NULL
    AND q.deleted_at IS NULL
ORDER BY z.number, z.id, aq.number;


-- BLOCK assessment_stats
SELECT * FROM assessment_stats WHERE id = $assessment_id;


-- BLOCK assessment_duration_stats
SELECT
    format_interval(ads.median) AS median,
    format_interval(ads.min) AS min,
    format_interval(ads.max) AS max,
    format_interval(ads.mean) AS mean,
    EXTRACT(EPOCH FROM ads.median) / 60 AS median_mins,
    EXTRACT(EPOCH FROM ads.min) / 60  AS min_mins,
    EXTRACT(EPOCH FROM ads.max) / 60  AS max_mins,
    EXTRACT(EPOCH FROM ads.mean) / 60  AS mean_mins,
    threshold_seconds,
    threshold_labels,
    hist
FROM assessment_duration_stats AS ads
WHERE id = $assessment_id;


-- BLOCK assessment_instance_scores
SELECT
    u.id AS user_id, u.uid, u.name, e.role, ai.score_perc,
    ai.number,ai.id AS assessment_instance_id,ai.open,
    format_interval(aid.duration) AS duration,
    EXTRACT(EPOCH FROM aid.duration) AS duration_secs,
    EXTRACT(EPOCH FROM aid.duration) / 60 AS duration_mins
FROM
    assessments AS a
    JOIN assessment_instances AS ai ON (ai.assessment_id = a.id)
    JOIN users AS u ON (u.id = ai.user_id)
    JOIN enrollments AS e ON (e.user_id = u.id AND e.course_instance_id = a.course_instance_id)
    LEFT JOIN assessment_instance_durations AS aid ON (aid.id = ai.id)
WHERE
    a.id = $assessment_id
ORDER BY
    e.role DESC, u.uid, u.id, ai.number;


-- BLOCK auth_and_open
WITH
aaai AS (
    SELECT
        *
    FROM
        auth_admin_assessment_instance($assessment_instance_id, 'Edit', $auth_data)
),
results AS (
    UPDATE assessment_instances AS ai
    SET
        open = true,
        opened_at = CURRENT_TIMESTAMP
    FROM
        aaai
    WHERE
        ai.id = $assessment_instance_id
        AND aaai.authorized
    RETURNING
        ai.open,
        ai.id AS assessment_instance_id
)
INSERT INTO assessment_state_logs AS asl
        (open, assessment_instance_id, auth_user_id)
(
    SELECT
        true, results.assessment_instance_id, aaai.auth_user_id
    FROM
        aaai,
        results
);

-- BLOCK auth_for_finish
WITH auth_and_last_dates AS (
    SELECT DISTINCT ON (id)
        ai.id,
        coalesce(s.date, ai.date) AS date, -- if no submissions then use the assessment start date
        coalesce(s.mode, ai.mode) AS mode,
        aaai.auth_user_id
    FROM
        assessment_instances AS ai
        JOIN instance_questions AS iq ON (iq.assessment_instance_id = ai.id)
        JOIN variants AS v ON (v.instance_question_id = iq.id)
        LEFT JOIN submissions AS s ON (s.variant_id = v.id) -- left join in case we have no submissions
        JOIN LATERAL auth_admin_assessment_instance(ai.id, 'Edit', $auth_data) AS aaai ON TRUE
    WHERE
        ai.id = $assessment_instance_id
        AND aaai.authorized
    ORDER BY
        id, date DESC
)
-- determine credit as of the last submission time
SELECT
    caa.credit
FROM
    auth_and_last_dates AS aald
    JOIN assessment_instances AS ai ON (ai.id = aald.id)
    JOIN assessments AS a ON (a.id = ai.assessment_id)
    JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
    JOIN users AS u ON (u.id = ai.user_id)
    JOIN enrollments AS e ON (e.user_id = u.id AND e.course_instance_id = ci.id)
    JOIN LATERAL check_assessment_access(a.id, aald.mode, e.role, u.uid, aald.date) AS caa ON TRUE;
