-- BLOCK questions
SELECT
    aq.*,q.qid,q.title,row_to_json(top) AS topic,
    tags_for_question(q.id) AS tags,
    ag.number AS alternative_group_number,
    ag.number_choose AS alternative_group_number_choose,
    (count(*) OVER (PARTITION BY ag.number)) AS alternative_group_size,
    z.title AS zone_title,z.number AS zone_number,
    z.number_choose as zone_number_choose,
    (lag(z.id) OVER (PARTITION BY z.id ORDER BY aq.number) IS NULL) AS start_new_zone,
    (lag(ag.id) OVER (PARTITION BY ag.id ORDER BY aq.number) IS NULL) AS start_new_alternative_group,
    assessments_for_question(q.id,ci.id,a.id) AS other_assessments
FROM
    assessment_questions AS aq
    JOIN questions AS q ON (q.id = aq.question_id)
    JOIN alternative_groups AS ag ON (ag.id = aq.alternative_group_id)
    JOIN zones AS z ON (z.id = ag.zone_id)
    JOIN topics AS top ON (top.id = q.topic_id)
    JOIN assessments AS a ON (a.id = aq.assessment_id)
    JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
WHERE
    a.id = $assessment_id
    AND aq.deleted_at IS NULL
    AND q.deleted_at IS NULL
ORDER BY z.number, z.id, aq.number;

-- BLOCK question_stats
WITH mean_question_scores AS (
    SELECT
        ai.user_id,
        aq.question_id,
        admin_assessment_question_number(aq.id) as number,
        avg(iq.score_perc) as user_score_perc
    FROM
        instance_questions AS iq
        JOIN assessment_instances AS ai ON (iq.assessment_instance_id = ai.id)
        JOIN assessment_questions AS aq ON (iq.assessment_question_id = aq.id)
    WHERE
        aq.assessment_id = $assessment_id AND
        aq.deleted_at IS NULL
    GROUP BY
        user_id,
        question_id,
        aq.id
),
mean_assessment_scores AS (
    SELECT
        ai.user_id,
        avg(ai.score_perc) AS user_score_perc
    FROM
        assessment_instances AS ai
    WHERE
        ai.assessment_id = $assessment_id
    GROUP BY
        user_id
)
SELECT
    mean_question_scores.question_id,
    greatest(0, least(100, avg(mean_question_scores.user_score_perc))) AS mean_score_per_question,
    mean_question_scores.number,
    greatest(0, least(100, corr(mean_question_scores.user_score_perc, mean_assessment_scores.user_score_perc) * 100.0)) AS discrimination
FROM mean_question_scores
    JOIN mean_assessment_scores ON (mean_assessment_scores.user_id = mean_question_scores.user_id)
GROUP BY
    mean_question_scores.question_id,
    mean_question_scores.number;

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
    END AS time_limit
FROM
    assessment_access_rules AS aar
    JOIN assessments AS a ON (a.id = aar.assessment_id)
    JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
WHERE
    a.id = $assessment_id
ORDER BY
    aar.number;

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


-- BLOCK assessment_instance_data
SELECT
    (aset.name || ' ' || a.number) AS assessment_label,
    u.user_id, u.uid, u.name, e.role, ai.score_perc,
    ai.number,ai.id AS assessment_instance_id,ai.open,
    CASE
        WHEN ai.open AND ai.date_limit IS NOT NULL
            THEN greatest(0, floor(extract(epoch from (ai.date_limit - current_timestamp)) / (60 * 1000)))::text || ' min'
        WHEN ai.open THEN 'Open'
        ELSE 'Closed'
    END AS time_remaining,
    format_interval(aid.duration) AS duration,
    EXTRACT(EPOCH FROM aid.duration) AS duration_secs,
    EXTRACT(EPOCH FROM aid.duration) / 60 AS duration_mins
FROM
    assessments AS a
    JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
    JOIN assessment_instances AS ai ON (ai.assessment_id = a.id)
    JOIN users AS u ON (u.user_id = ai.user_id)
    JOIN enrollments AS e ON (e.user_id = u.user_id AND e.course_instance_id = a.course_instance_id)
    LEFT JOIN assessment_instance_durations AS aid ON (aid.id = ai.id)
WHERE
    a.id = $assessment_id
ORDER BY
    e.role DESC, u.uid, u.user_id, ai.number;


-- BLOCK assessment_instance_scores
SELECT
    u.uid,
    max(ai.score_perc) AS score_perc
FROM
    assessments AS a
    JOIN assessment_instances AS ai ON (ai.assessment_id = a.id)
    JOIN users AS u ON (u.user_id = ai.user_id)
WHERE
    a.id = $assessment_id
GROUP BY
    u.user_id
ORDER BY
    u.uid, u.user_id;


-- BLOCK assessment_instance_scores_by_username
SELECT
    regexp_replace(u.uid, '@.*', '') AS username,
    max(ai.score_perc) AS score_perc
FROM
    assessments AS a
    JOIN assessment_instances AS ai ON (ai.assessment_id = a.id)
    JOIN users AS u ON (u.user_id = ai.user_id)
WHERE
    a.id = $assessment_id
GROUP BY
    u.user_id
ORDER BY
    u.uid, u.user_id;


-- BLOCK assessment_instance_scores_all
SELECT
    u.uid,
    ai.number,
    ai.score_perc
FROM
    assessments AS a
    JOIN assessment_instances AS ai ON (ai.assessment_id = a.id)
    JOIN users AS u ON (u.user_id = ai.user_id)
WHERE
    a.id = $assessment_id
ORDER BY
    u.uid, u.user_id, ai.number;


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
        JOIN enrollments AS e ON (e.user_id = u.user_id AND e.course_instance_id = ci.id)
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
        (row_number() OVER (PARTITION BY v.id ORDER BY s.date DESC, s.id DESC)) = 1 AS final_submission_per_variant
    FROM
        assessments AS a
        JOIN assessment_instances AS ai ON (ai.assessment_id = a.id)
        JOIN users AS u ON (u.user_id = ai.user_id)
        JOIN instance_questions AS iq ON (iq.assessment_instance_id = ai.id)
        JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
        JOIN questions AS q ON (q.id = aq.question_id)
        JOIN variants AS v ON (v.instance_question_id = iq.id)
        JOIN submissions AS s ON (s.variant_id = v.id)
    WHERE
        a.id = $assessment_id
        AND v.params ? 'fileName'
        AND s.submitted_answer ? 'fileData'
)
SELECT
    (
        uid
        || '_' || assessment_instance_number
        || '_' || qid
        || '_' || variant_number
        || '_' || submission_number
        || '_' || (params->>'fileName')
    ) AS filename,
    decode(submitted_answer->>'fileData', 'base64') AS contents
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
    JOIN LATERAL check_assessment_access(a.id, ld.mode, e.role, u.uid, ld.date, ci.display_timezone) AS caa ON TRUE;
