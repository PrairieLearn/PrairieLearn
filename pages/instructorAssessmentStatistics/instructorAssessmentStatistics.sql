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
    u.user_id, u.uid, u.name, coalesce(e.role, 'None'::enum_role) AS role,
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
    e.role DESC, u.uid, u.user_id, ai.number, ai.id;

-- BLOCK select_upload_job_sequences
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
    AND (js.type = 'upload_question_scores' OR js.type = 'upload_assessment_instance_scores')
ORDER BY
    js.start_date DESC, js.id;

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

-- BLOCK select_instance_questions
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
    format_date_iso8601(iq.created_at, ci.display_timezone) AS date_formatted,
    iq.highest_submission_score,
    iq.last_submission_score,
    iq.number_attempts,
    extract(epoch FROM iq.duration) AS duration_seconds
FROM
    instance_questions AS iq
    JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
    JOIN questions AS q ON (q.id = aq.question_id)
    JOIN assessment_instances AS ai ON (ai.id = iq.assessment_instance_id)
    JOIN assessments AS a ON (a.id = ai.assessment_id)
    JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
    JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
    JOIN users AS u ON (u.user_id = ai.user_id)
    LEFT JOIN enrollments AS e ON (e.user_id = u.user_id AND e.course_instance_id = ci.id)
WHERE
    a.id = $assessment_id
ORDER BY
    u.uid, ai.number, q.qid, iq.number, iq.id;

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
        (row_number() OVER (PARTITION BY v.id ORDER BY s.date DESC, s.id DESC)) = 1 AS final_submission_per_variant,
        (row_number() OVER (PARTITION BY v.id ORDER BY s.score DESC, s.id DESC)) = 1 AS best_submission_per_variant
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
    $include_all
    OR ($include_final AND final_submission_per_variant)
    OR ($include_best AND best_submission_per_variant)
ORDER BY
    uid, assessment_instance_number, qid, instance_question_number, variant_number, date;


-- BLOCK assessment_instance_files
WITH all_submissions_with_files AS (
    SELECT
        s.id AS submission_id,
        u.uid,
        ai.number AS assessment_instance_number,
        q.qid,
        v.number AS variant_number,
        v.params,
        s.date,
        s.submitted_answer,
        row_number() OVER (PARTITION BY v.id ORDER BY s.date) AS submission_number,
        (row_number() OVER (PARTITION BY v.id ORDER BY s.date DESC, s.id DESC)) = 1 AS final_submission_per_variant,
        (row_number() OVER (PARTITION BY v.id ORDER BY s.score DESC, s.id DESC)) = 1 AS best_submission_per_variant
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
        AND (
            (v.params ? 'fileName' AND s.submitted_answer ? 'fileData')
            OR (s.submitted_answer ? '_files')
        )
),
use_submissions_with_files AS (
    SELECT *
    FROM all_submissions_with_files
    WHERE
        $include_all
        OR ($include_final AND final_submission_per_variant)
        OR ($include_best AND best_submission_per_variant)
),
all_files AS (
    SELECT
        uid,
        assessment_instance_number,
        qid,
        variant_number,
        date,
        submission_number,
        (CASE
            WHEN submitted_answer ? 'fileData' THEN params->>'fileName'
            WHEN submitted_answer ? '_files' THEN f.file->>'name'
        END) as filename,
        (CASE
            WHEN submitted_answer ? 'fileData' THEN submitted_answer->>'fileData'
            WHEN submitted_answer ? '_files' THEN f.file->>'contents'
        END) as contents
    FROM
        use_submissions_with_files AS s
        LEFT JOIN (
            SELECT
                submission_id AS id,
                jsonb_array_elements(submitted_answer->'_files') AS file
            FROM use_submissions_with_files
            WHERE submitted_answer ? '_files'
        ) f ON (f.id = submission_id)
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
    all_files
ORDER BY
    uid, assessment_instance_number, qid, variant_number, date
LIMIT
    $limit
OFFSET
    $offset;


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

