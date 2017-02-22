-- BLOCK questions
WITH issue_count AS (
    SELECT
        q.id AS question_id,
        count(*) AS open_issue_count
    FROM
        issues AS i
        JOIN questions AS q ON (q.id = i.question_id)
    WHERE
        i.assessment_id = $assessment_id
        AND i.course_caused
        AND i.open
    GROUP BY q.id
), question_scores AS (
    SELECT
        aq.question_id,
        avg(aq.mean_score) AS question_score
    FROM
        assessment_questions AS aq
    GROUP BY
        aq.question_id
)
SELECT
    aq.*,q.qid,q.title,row_to_json(top) AS topic,
    q.id AS question_id,
    admin_assessment_question_number(aq.id) as number,
    tags_for_question(q.id) AS tags,
    ag.number AS alternative_group_number,
    ag.number_choose AS alternative_group_number_choose,
    (count(*) OVER (PARTITION BY ag.number)) AS alternative_group_size,
    z.title AS zone_title,z.number AS zone_number,
    z.number_choose as zone_number_choose,
    (lag(z.id) OVER (PARTITION BY z.id ORDER BY aq.number) IS NULL) AS start_new_zone,
    (lag(ag.id) OVER (PARTITION BY ag.id ORDER BY aq.number) IS NULL) AS start_new_alternative_group,
    assessments_format_for_question(q.id,ci.id,a.id) AS other_assessments,
    coalesce(ic.open_issue_count, 0) AS open_issue_count
    question_scores.question_score AS avg_question_score_perc
FROM
    assessment_questions AS aq
    JOIN questions AS q ON (q.id = aq.question_id)
    JOIN alternative_groups AS ag ON (ag.id = aq.alternative_group_id)
    JOIN zones AS z ON (z.id = ag.zone_id)
    JOIN topics AS top ON (top.id = q.topic_id)
    JOIN assessments AS a ON (a.id = aq.assessment_id)
    JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
    LEFT JOIN issue_count AS ic ON (ic.question_id = q.id)
    LEFT JOIN question_scores ON (question_scores.question_id = q.id)
WHERE
    a.id = $assessment_id
    AND aq.deleted_at IS NULL
    AND q.deleted_at IS NULL
ORDER BY z.number, z.id, aq.number;

-- BLOCK assessment_access_rules
SELECT
    CASE
        WHEN aar.mode IS NULL THEN '—'
        ELSE aar.mode::text
    END AS mode,
    CASE
        WHEN aar.role IS NULL THEN '—'
        ELSE aar.role::text
    END AS role,
    CASE
        WHEN aar.uids IS NULL THEN '—'
        ELSE array_to_string(aar.uids, ', ')
    END AS uids,
    CASE
        WHEN aar.start_date IS NULL THEN '—'
        ELSE format_date_full_compact(aar.start_date, ci.display_timezone)
    END AS start_date,
    CASE
        WHEN aar.end_date IS NULL THEN '—'
        ELSE format_date_full_compact(aar.end_date, ci.display_timezone)
    END AS end_date,
    CASE
        WHEN aar.credit IS NULL THEN '—'
        ELSE aar.credit::text || '%'
    END AS credit,
    CASE
        WHEN aar.time_limit_min IS NULL THEN '—'
        ELSE aar.time_limit_min::text || ' min'
    END AS time_limit,
    CASE
        WHEN aar.password IS NULL THEN '—'
        ELSE aar.password
    END AS password
FROM
    assessment_access_rules AS aar
    JOIN assessments AS a ON (a.id = aar.assessment_id)
    JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
WHERE
    a.id = $assessment_id
ORDER BY
    aar.number;

-- BLOCK assessment_score_histogram_by_date
WITH assessment_instances_by_user_and_date AS (
    SELECT
        ai.user_id,
        avg(ai.score_perc) AS score_perc,
        date_trunc('day', ai.date AT TIME ZONE ci.display_timezone) AS date
    FROM
        assessment_instances AS ai
        JOIN assessments AS a ON (a.id = ai.assessment_id)
        JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
        JOIN users AS u ON (u.user_id = ai.user_id)
        JOIN enrollments AS e ON (e.user_id = u.user_id AND e.course_instance_id = ci.id)
    WHERE
        ai.assessment_id = $assessment_id
        AND e.role = 'Student'
    GROUP BY
        ai.user_id, date_trunc('day', date AT TIME ZONE ci.display_timezone)
)
SELECT
    ai_by_user_and_date.date,
    to_char(ai_by_user_and_date.date, 'DD Mon') AS date_formatted,
    count(score_perc) AS number,
    avg(score_perc) AS mean_score_perc,
    histogram(score_perc, 0, 100, 10)
FROM
    assessment_instances_by_user_and_date AS ai_by_user_and_date
GROUP BY
    ai_by_user_and_date.date
ORDER BY
    ai_by_user_and_date.date;

-- BLOCK assessment_stats
SELECT * FROM assessments_stats($assessment_id);

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
FROM assessments_duration_stats($assessment_id) AS ads;

-- BLOCK select_assessment_instances
SELECT
    (aset.name || ' ' || a.number) AS assessment_label,
    u.user_id, u.uid, u.name, e.role,
    substring(u.uid from '^[^@]+') AS username,
    ai.score_perc, ai.points, ai.max_points,
    ai.number,ai.id AS assessment_instance_id,ai.open,
    CASE
        WHEN ai.open AND ai.date_limit IS NOT NULL
            THEN greatest(0, floor(extract(epoch from (ai.date_limit - current_timestamp)) / (60 * 1000)))::text || ' min'
        WHEN ai.open THEN 'Open'
        ELSE 'Closed'
    END AS time_remaining,
    format_date_iso8601(ai.date, ci.display_timezone) AS date_formatted,
    format_interval(ai.duration) AS duration,
    EXTRACT(EPOCH FROM ai.duration) AS duration_secs,
    EXTRACT(EPOCH FROM ai.duration) / 60 AS duration_mins,
    (row_number() OVER (PARTITION BY u.user_id ORDER BY score_perc DESC, ai.number DESC, ai.id DESC)) = 1 AS highest_score
FROM
    assessments AS a
    JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
    JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
    JOIN assessment_instances AS ai ON (ai.assessment_id = a.id)
    JOIN users AS u ON (u.user_id = ai.user_id)
    LEFT JOIN enrollments AS e ON (e.user_id = u.user_id AND e.course_instance_id = a.course_instance_id)
WHERE
    a.id = $assessment_id
ORDER BY
    e.role DESC NULLS FIRST, u.uid, u.user_id, ai.number, ai.id;

-- BLOCK select_regrading_job_sequences
SELECT
    js.*,
    format_date_full_compact(js.start_date, c.display_timezone) AS start_date_formatted,
    u.uid AS user_uid
FROM
    job_sequences AS js
    JOIN pl_courses AS c ON (c.id = js.course_id)
    JOIN users AS u on (u.user_id = js.user_id)
WHERE
    js.assessment_id = $assessment_id
    AND (js.type = 'regrade_assessment' OR js.type = 'regrade_assessment_instance')
ORDER BY
    js.start_date DESC, js.id;


-- BLOCK assessment_instance_submissions
WITH all_submissions AS (
    SELECT
        u.uid,
        u.name,
        e.role,
        (aset.name || ' ' || a.number) AS assessment_label,
        ai.number AS assessment_instance_number,
        q.qid,
        iq.number AS instance_question_number,
        iq.points,
        iq.score_perc,
        aq.max_points,
        v.number AS variant_number,
        v.variant_seed,
        v.params,
        v.true_answer,
        v.options,
        s.date,
        format_date_iso8601(s.date, ci.display_timezone) AS submission_date_formatted,
        s.submitted_answer,
        s.override_score,
        s.credit,
        s.mode,
        format_date_iso8601(s.grading_requested_at, ci.display_timezone) AS grading_requested_at_formatted,
        format_date_iso8601(s.graded_at, ci.display_timezone) AS graded_at_formatted,
        s.score,
        CASE WHEN s.correct THEN 'TRUE' ELSE 'FALSE' END AS correct,
        s.feedback,
        (row_number() OVER (PARTITION BY v.id ORDER BY s.date DESC, s.id DESC)) = 1 AS final_submission_per_variant
    FROM
        assessments AS a
        JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
        JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
        JOIN assessment_instances AS ai ON (ai.assessment_id = a.id)
        JOIN users AS u ON (u.user_id = ai.user_id)
        LEFT JOIN enrollments AS e ON (e.user_id = u.user_id AND e.course_instance_id = ci.id)
        JOIN instance_questions AS iq ON (iq.assessment_instance_id = ai.id)
        JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
        JOIN questions AS q ON (q.id = aq.question_id)
        JOIN variants AS v ON (v.instance_question_id = iq.id)
        JOIN submissions AS s ON (s.variant_id = v.id)
    WHERE
        a.id = $assessment_id
)
SELECT
    *
FROM
    all_submissions
WHERE
    $include_all OR final_submission_per_variant
ORDER BY
    uid, assessment_instance_number, qid, instance_question_number, variant_number, date;


-- BLOCK assessment_instance_files
WITH all_file_submissions AS (
    SELECT
        u.uid,
        ai.number AS assessment_instance_number,
        q.qid,
        v.number AS variant_number,
        v.params,
        s.date,
        s.submitted_answer,
        row_number() OVER (PARTITION BY v.id ORDER BY s.date) AS submission_number,
        (row_number() OVER (PARTITION BY v.id ORDER BY s.date DESC, s.id DESC)) = 1 AS final_submission_per_variant,
        (CASE
            WHEN s.submitted_answer ? 'fileData' THEN v.params->>'fileName'
            WHEN s.submitted_answer ? '_files' THEN f.file->>'name'
        END) as filename,
        (CASE
            WHEN s.submitted_answer ? 'fileData' THEN s.submitted_answer->>'fileData'
            WHEN s.submitted_answer ? '_files' THEN f.file->>'contents'
        END) as contents
    FROM
        assessments AS a
        JOIN assessment_instances AS ai ON (ai.assessment_id = a.id)
        JOIN users AS u ON (u.user_id = ai.user_id)
        JOIN instance_questions AS iq ON (iq.assessment_instance_id = ai.id)
        JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
        JOIN questions AS q ON (q.id = aq.question_id)
        JOIN variants AS v ON (v.instance_question_id = iq.id)
        JOIN submissions AS s ON (s.variant_id = v.id)
        LEFT JOIN (
            SELECT
                id,
                jsonb_array_elements(submitted_answer->'_files') AS file
            FROM submissions
        ) f ON (f.id = s.id)
    WHERE
        a.id = $assessment_id
        AND (
            (v.params ? 'fileName' AND s.submitted_answer ? 'fileData')
            OR (s.submitted_answer ? '_files')
        )
)
SELECT
    (
        uid
        || '_' || assessment_instance_number
        || '_' || qid
        || '_' || variant_number
        || '_' || submission_number
        || '_' || filename
    ) AS filename,
    decode(contents, 'base64') AS contents
FROM
    all_file_submissions
WHERE
    $include_all OR final_submission_per_variant
ORDER BY
    uid, assessment_instance_number, qid, variant_number, date;


-- BLOCK open
WITH results AS (
    UPDATE assessment_instances AS ai
    SET
        open = true,
        date_limit = NULL,
        auto_close = FALSE
    FROM
        assessments AS a
    WHERE
        ai.id = $assessment_instance_id
        AND a.id = ai.assessment_id
        AND a.id = $assessment_id
    RETURNING
        ai.open,
        ai.id AS assessment_instance_id
)
INSERT INTO assessment_state_logs AS asl
        (open, assessment_instance_id, auth_user_id)
(
    SELECT
        true, results.assessment_instance_id, $authn_user_id
    FROM
        results
);

-- BLOCK select_finish_data
WITH last_dates AS (
    SELECT DISTINCT ON (id)
        ai.id,
        coalesce(s.date, ai.date) AS date, -- if no submissions then use the assessment start date
        coalesce(s.mode, ai.mode) AS mode
    FROM
        assessment_instances AS ai
        JOIN assessments AS a ON (a.id = ai.assessment_id)
        JOIN instance_questions AS iq ON (iq.assessment_instance_id = ai.id)
        JOIN variants AS v ON (v.instance_question_id = iq.id)
        LEFT JOIN submissions AS s ON (s.variant_id = v.id) -- left join in case we have no submissions
    WHERE
        ai.id = $assessment_instance_id
        AND a.id = $assessment_id -- check that we are in the assessment that we have authorized
    ORDER BY
        id, date DESC
)
-- determine credit as of the last submission time
SELECT
    caa.credit,
    a.type AS assessment_type
FROM
    last_dates AS ld
    JOIN assessment_instances AS ai ON (ai.id = ld.id)
    JOIN assessments AS a ON (a.id = ai.assessment_id)
    JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
    JOIN users AS u ON (u.user_id = ai.user_id)
    JOIN enrollments AS e ON (e.user_id = u.user_id AND e.course_instance_id = ci.id)
    JOIN LATERAL check_assessment_access(a.id, ld.mode, e.role, u.user_id, u.uid, ld.date, ci.display_timezone) AS caa ON TRUE;


-- BLOCK select_regrade_assessment_instance_info
SELECT
    assessment_instance_label(ai, a, aset),
    u.uid AS user_uid,
    a.id AS assessment_id
FROM
    assessment_instances AS ai
    JOIN assessments AS a ON (a.id = ai.assessment_id)
    JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
    JOIN users AS u USING (user_id)
WHERE
    ai.id = $assessment_instance_id;


-- BLOCK select_regrade_assessment_info
SELECT
    assessment_label(a, aset)
FROM
    assessments AS a
    JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
WHERE
    a.id = $assessment_id;


-- BLOCK select_regrade_assessment_instances
SELECT
    ai.id AS assessment_instance_id,
    assessment_instance_label(ai, a, aset),
    u.uid AS user_uid
FROM
    assessments AS a
    JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
    JOIN assessment_instances AS ai ON (ai.assessment_id = a.id)
    JOIN users AS u ON (u.user_id = ai.user_id)
WHERE
    a.id = $assessment_id
ORDER BY
    u.uid, u.user_id, ai.number;

-- BLOCK assessment_stats_last_updated
SELECT
    CASE
        WHEN a.stats_last_updated IS NULL THEN 'never'
        ELSE format_date_full_compact(a.stats_last_updated, ci.display_timezone)
    END AS stats_last_updated
FROM
    assessments AS a
    JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
WHERE
    a.id = $assessment_id
