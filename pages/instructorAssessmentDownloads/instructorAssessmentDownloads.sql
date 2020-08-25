-- BLOCK select_assessment_instances
SELECT
    (aset.name || ' ' || a.number) AS assessment_label,
    u.user_id, u.uid, u.uin, u.name, coalesce(e.role, 'None'::enum_role) AS role,
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
    (row_number() OVER (PARTITION BY u.user_id ORDER BY score_perc DESC, ai.number DESC, ai.id DESC)) = 1 AS highest_score,
    (row_number() OVER (PARTITION BY g.id)) = 1 AS unique_group,
    g.name AS groupname,
    groups_uid_list(g.id) AS uid_list
FROM
    assessments AS a
    JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
    JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
    JOIN assessment_instances AS ai ON (ai.assessment_id = a.id)
    LEFT JOIN group_configs AS gc ON (gc.assessment_id = a.id)
    LEFT JOIN groups AS g ON (g.id = ai.group_id AND g.group_config_id = gc.id)
    LEFT JOIN group_users AS gu ON (gu.group_id = g.id)
    JOIN users AS u ON (u.user_id = ai.user_id OR u.user_id = gu.user_id)
    LEFT JOIN enrollments AS e ON (e.user_id = u.user_id AND e.course_instance_id = a.course_instance_id)
WHERE
    a.id = $assessment_id
ORDER BY
    e.role DESC, u.uid, groupname, u.uin, u.user_id, ai.number, ai.id;


-- BLOCK select_instance_questions
WITH instance_questions AS (
    SELECT
        u.uid,
        u.uin,
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
        extract(epoch FROM iq.duration) AS duration_seconds,
        (row_number() OVER (PARTITION BY g.id, q.id)) = 1 AS unique_group,
        g.name AS groupname,
        groups_uid_list(g.id) AS uid_list
    FROM
        instance_questions AS iq
        JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
        JOIN questions AS q ON (q.id = aq.question_id)
        JOIN assessment_instances AS ai ON (ai.id = iq.assessment_instance_id)
        JOIN assessments AS a ON (a.id = ai.assessment_id)
        JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
        JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
        LEFT JOIN group_configs AS gc ON (gc.assessment_id = a.id)
        LEFT JOIN groups AS g ON (g.id = ai.group_id AND g.group_config_id = gc.id)
        LEFT JOIN group_users AS gu ON (gu.group_id = g.id)
        JOIN users AS u ON (u.user_id = ai.user_id OR u.user_id = gu.user_id)
        LEFT JOIN enrollments AS e ON (e.user_id = u.user_id AND e.course_instance_id = ci.id)
    WHERE
        a.id = $assessment_id
    ORDER BY
        u.uid, u.uin, groupname, ai.number, q.qid, iq.number, iq.id
)
SELECT 
    *
FROM 
    instance_questions 
WHERE 
    ($group_work AND unique_group) OR $group_work = false;


-- BLOCK submissions_for_manual_grading
WITH final_assessment_instances AS (
    SELECT DISTINCT ON (g.id, u.user_id)
        u.user_id,
        g.id AS group_id,
        ai.id,
        assessment_id,
        g.name AS groupname,
        groups_uid_list(g.id) AS uid_list
    FROM
        assessment_instances AS ai
        LEFT JOIN groups AS g ON (g.id = ai.group_id)
        LEFT JOIN users AS u ON (u.user_id = ai.user_id)
    WHERE ai.assessment_id = $assessment_id
    ORDER BY g.id, u.user_id, ai.number DESC
)
SELECT DISTINCT ON (ai.id, q.qid)
    u.uid,
    u.uin,
    q.qid,
    iq.score_perc AS old_score_perc,
    s.id AS submission_id,
    v.params,
    v.true_answer,
    (s.submitted_answer - '_files') AS submitted_answer,
    s.partial_scores,
    ai.groupname,
    ai.uid_list
FROM
    submissions AS s
    JOIN variants AS v ON (v.id = s.variant_id)
    JOIN instance_questions AS iq ON (iq.id = v.instance_question_id)
    JOIN final_assessment_instances AS ai ON (ai.id = iq.assessment_instance_id)
    LEFT JOIN users AS u ON (u.user_id = ai.user_id)
    JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
    JOIN questions AS q ON (q.id = aq.question_id)
ORDER BY ai.id, q.qid, s.date DESC;


-- BLOCK assessment_instance_submissions
WITH all_submissions AS (
    SELECT
        u.uid,
        u.uin,
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
        s.id AS submission_id,
        format_date_iso8601(s.date, ci.display_timezone) AS submission_date_formatted,
        s.submitted_answer,
        s.partial_scores,
        s.override_score,
        s.credit,
        s.mode,
        format_date_iso8601(s.grading_requested_at, ci.display_timezone) AS grading_requested_at_formatted,
        format_date_iso8601(s.graded_at, ci.display_timezone) AS graded_at_formatted,
        s.score,
        CASE WHEN s.correct THEN 'TRUE' WHEN NOT s.correct THEN 'FALSE' ELSE NULL END AS correct,
        s.feedback,
        (row_number() OVER (PARTITION BY v.id ORDER BY s.date DESC, s.id DESC)) = 1 AS final_submission_per_variant,
        (row_number() OVER (PARTITION BY v.id ORDER BY s.score DESC NULLS LAST, s.date DESC, s.id DESC)) = 1 AS best_submission_per_variant,
        (row_number() OVER (PARTITION BY g.id, v.id, s.id)) = 1 AS unique_group,
        g.name AS groupname,
        groups_uid_list(g.id) AS uid_list,
        su.uid AS submission_user
    FROM
        assessments AS a
        JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
        JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
        JOIN assessment_instances AS ai ON (ai.assessment_id = a.id)
        LEFT JOIN group_configs AS gc ON (gc.assessment_id = a.id)
        LEFT JOIN groups AS g ON (g.id = ai.group_id AND g.group_config_id = gc.id)
        LEFT JOIN group_users AS gu ON (gu.group_id = g.id)
        JOIN users AS u ON (u.user_id = ai.user_id OR u.user_id = gu.user_id)
        LEFT JOIN enrollments AS e ON (e.user_id = u.user_id AND e.course_instance_id = ci.id)
        JOIN instance_questions AS iq ON (iq.assessment_instance_id = ai.id)
        JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
        JOIN questions AS q ON (q.id = aq.question_id)
        JOIN variants AS v ON (v.instance_question_id = iq.id)
        JOIN submissions AS s ON (s.variant_id = v.id)
        LEFT JOIN users AS su ON (su.user_id = s.auth_user_id)
    WHERE
        a.id = $assessment_id
)
SELECT
    *
FROM
    all_submissions
WHERE
    ($include_all
        OR ($include_final AND final_submission_per_variant)
        OR ($include_best AND best_submission_per_variant))
        AND (($group_work AND unique_group) OR ($group_work = false))
ORDER BY
    uid, groupname, assessment_instance_number, qid, instance_question_number, variant_number, date;


-- BLOCK files_for_manual_grading
WITH
final_assessment_instances AS (
    SELECT DISTINCT ON (g.id, u.user_id)
        u.user_id,
        g.id AS group_id,
        ai.id,
        g.name AS groupname
    FROM
        assessment_instances AS ai
        LEFT JOIN groups AS g ON (g.id = ai.group_id)
        LEFT JOIN users AS u ON (u.user_id = ai.user_id)
    WHERE ai.assessment_id = $assessment_id
    ORDER BY g.id, u.user_id, ai.number DESC
),
submissions_with_files AS (
    SELECT DISTINCT ON (ai.id, q.qid)
        u.uid,
        u.uin,
        q.qid,
        s.id AS submission_id,
        s.submitted_answer,
        v.params,
        ai.groupname
    FROM
        submissions AS s
        JOIN variants AS v ON (v.id = s.variant_id)
        JOIN instance_questions AS iq ON (iq.id = v.instance_question_id)
        JOIN final_assessment_instances AS ai ON (ai.id = iq.assessment_instance_id)
        LEFT JOIN users AS u ON (u.user_id = ai.user_id)
        JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
        JOIN questions AS q ON (q.id = aq.question_id)
    WHERE
        (v.params ? 'fileName' AND s.submitted_answer ? 'fileData')
        OR (s.submitted_answer ? '_files')
    ORDER BY ai.id, q.qid, s.date DESC
),
all_files AS (
    SELECT
        uid,
        groupname,
        uin,
        qid,
        submission_id,
        (CASE
            WHEN submitted_answer ? 'fileData' THEN params->>'fileName'
            WHEN submitted_answer ? '_files' THEN f.file->>'name'
        END) as filename,
        (CASE
            WHEN submitted_answer ? 'fileData' THEN submitted_answer->>'fileData'
            WHEN submitted_answer ? '_files' THEN f.file->>'contents'
        END) as contents
    FROM
        submissions_with_files AS s
        LEFT JOIN (
            SELECT
                submission_id AS id,
                jsonb_array_elements(submitted_answer->'_files') AS file
            FROM submissions_with_files
            WHERE submitted_answer ? '_files'
        ) f ON (f.id = submission_id)
)
SELECT
    (
        (CASE 
            WHEN $group_work THEN groupname
            ELSE uid || '_' || uin
        END )
        || '_' || qid
        || '_' || submission_id
        || '_' || filename
    ) AS filename,
    base64_safe_decode(contents) AS contents
FROM
    all_files
WHERE
    filename IS NOT NULL
    AND contents IS NOT NULL
ORDER BY
    (CASE 
        WHEN $group_work THEN groupname
        ELSE uid
     END), 
    (CASE 
        WHEN $group_work THEN NULL
        ELSE uin
     END),  
        qid, filename, submission_id
LIMIT
    $limit
OFFSET
    $offset;


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
        (row_number() OVER (PARTITION BY v.id ORDER BY s.score DESC NULLS LAST, s.date DESC, s.id DESC)) = 1 AS best_submission_per_variant,
        (row_number() OVER (PARTITION BY g.id, v.id, s.id)) = 1 AS unique_group,
        g.name AS groupname
    FROM
        assessments AS a
        JOIN assessment_instances AS ai ON (ai.assessment_id = a.id)
        LEFT JOIN group_configs AS gc ON (gc.assessment_id = a.id)
        LEFT JOIN groups AS g ON (g.id = ai.group_id AND g.group_config_id = gc.id)
        LEFT JOIN group_users AS gu ON (gu.group_id = g.id)
        JOIN users AS u ON (u.user_id = ai.user_id OR u.user_id = gu.user_id)
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
        ($include_all
        OR ($include_final AND final_submission_per_variant)
        OR ($include_best AND best_submission_per_variant))
        AND (($group_work AND unique_group) OR ($group_work = false))
),
all_files AS (
    SELECT
        uid,
        groupname,
        assessment_instance_number,
        qid,
        variant_number,
        date,
        submission_id,
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
        (CASE WHEN $group_work THEN groupname 
              ELSE uid
        END)
        || '_' || assessment_instance_number
        || '_' || qid
        || '_' || variant_number
        || '_' || submission_number
        || '_' || submission_id
        || '_' || filename
    ) AS filename,
    base64_safe_decode(contents) AS contents
FROM
    all_files
WHERE
    filename IS NOT NULL
    AND contents IS NOT NULL
ORDER BY
    (CASE WHEN $group_work THEN groupname 
          ELSE uid
    END), assessment_instance_number, qid, variant_number, date
LIMIT
    $limit
OFFSET
    $offset;

-- BLOCK group_configs
SELECT 
    g.name, u.uid
FROM 
    group_configs AS gc
    JOIN groups AS g ON gc.id = g.group_config_id
    JOIN group_users AS gu ON g.id = gu.group_id
    JOIN users AS u ON gu.user_id = u.user_id
WHERE
    gc.assessment_id = $assessment_id 
    AND gc.deleted_at IS NULL 
    AND g.deleted_at IS NULL
ORDER BY 
    g.name, u.uid;
