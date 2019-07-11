-- BLOCK select_assessments
WITH issue_count AS (
    SELECT
        a.id AS assessment_id,
        count(*) AS open_issue_count
    FROM
        assessments AS a
        JOIN issues AS i ON (i.assessment_id = a.id)
    WHERE
        a.course_instance_id = $course_instance_id
        AND i.course_caused
        AND i.open
    GROUP BY a.id
)
SELECT
    a.id,
    a.tid,
    a.course_instance_id,
    a.type,
    a.number as assessment_number,
    a.title,
    a.assessment_set_id,
    tstats.number,
    tstats.mean,
    tstats.std,
    tstats.min,
    tstats.max,
    tstats.median,
    tstats.n_zero,
    tstats.n_hundred,
    tstats.n_zero_perc,
    n_hundred_perc,
    tstats.score_hist,
    format_interval(dstats.mean) AS mean_duration,
    format_interval(dstats.median) AS median_duration,
    dstats.min AS min_duration,
    dstats.max AS max_duration,
    aset.abbreviation,
    aset.name,
    aset.heading,
    aset.color,
    (aset.abbreviation || a.number) as label,
    (lag(aset.id) OVER (PARTITION BY aset.id ORDER BY a.order_by, a.id) IS NULL) AS start_new_set,
    coalesce(ic.open_issue_count, 0) AS open_issue_count
FROM
    assessments AS a
    JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
    LEFT JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
    LEFT JOIN LATERAL assessments_stats(a.id) AS tstats ON TRUE
    LEFT JOIN LATERAL assessments_duration_stats(a.id) AS dstats ON TRUE
    LEFT JOIN LATERAL authz_assessment(a.id, $authz_data, $req_date, ci.display_timezone) AS aa ON TRUE
    LEFT JOIN issue_count AS ic ON (ic.assessment_id = a.id)
WHERE
    ci.id = $course_instance_id
    AND a.deleted_at IS NULL
    AND aa.authorized
ORDER BY
    aset.number, a.order_by, a.id;

-- BLOCK course_instance_files
WITH all_file_submissions AS (
    SELECT
        u.uid,
        a.tid,
        ai.number AS assessment_instance_number,
        q.qid,
        v.number AS variant_number,
        v.params,
        s.date,
        s.submitted_answer,
        row_number() OVER (PARTITION BY v.id ORDER BY s.date) AS submission_number,
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
        a.course_instance_id = $course_instance_id
        AND (
            (v.params ? 'fileName' AND s.submitted_answer ? 'fileData')
            OR (s.submitted_answer ? '_files')
        )
)
SELECT
    (
        tid
        || '_' || uid
        || '_' || assessment_instance_number
        || '_' || qid
        || '_' || variant_number
        || '_' || submission_number
        || '_' || filename
    ) AS filename,
    decode(contents, 'base64') AS contents
FROM
    all_file_submissions
ORDER BY
    tid, uid, assessment_instance_number, qid, variant_number, date
LIMIT
    $limit
OFFSET
    $offset;
