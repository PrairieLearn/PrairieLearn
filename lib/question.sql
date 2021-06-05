-- BLOCK select_issues
SELECT
    i.*,
    format_date_full(i.date, coalesce(ci.display_timezone, c.display_timezone)) AS formatted_date,
    u.uid AS user_uid,
    u.name AS user_name
FROM
    issues AS i
    LEFT JOIN course_instances AS ci ON (ci.id = i.course_instance_id)
    JOIN pl_courses AS c ON (c.id = i.course_id)
    LEFT JOIN users AS u ON (u.user_id = i.user_id)
WHERE
    i.variant_id = $variant_id
    AND i.course_caused
ORDER BY
    i.date;

-- BLOCK select_submissions
SELECT
    s.*,
    to_jsonb(gj) AS grading_job,
    -- These are separate for historical reasons
    gj.id AS grading_job_id,
    grading_job_status(gj.id) AS grading_job_status,
    format_date_full_compact(s.date, coalesce(ci.display_timezone, c.display_timezone)) AS formatted_date,
    CASE
        WHEN s.grading_requested_at IS NOT NULL THEN format_interval($req_date - s.grading_requested_at)
        ELSE NULL
    END AS elapsed_grading_time
FROM
    submissions AS s
    JOIN variants AS v ON (v.id = s.variant_id)
    LEFT JOIN instance_questions AS iq ON (iq.id = v.instance_question_id)
    LEFT JOIN assessment_instances AS ai ON (ai.id = iq.assessment_instance_id)
    LEFT JOIN assessments AS a ON (a.id = ai.assessment_id)
    LEFT JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
    JOIN questions AS q ON (q.id = v.question_id)
    JOIN pl_courses AS c ON (c.id = q.course_id)
    LEFT JOIN LATERAL (
        SELECT *
        FROM grading_jobs
        WHERE submission_id = s.id
        ORDER BY id DESC
        LIMIT 1
    ) AS gj ON TRUE
WHERE
    v.id = $variant_id
ORDER BY
    s.date DESC;

-- BLOCK select_issues_for_variant
SELECT i.*
FROM issues AS i
WHERE i.variant_id = $variant_id;

-- BLOCK select_submission_info
SELECT
    to_jsonb(gj) AS grading_job,
    to_jsonb(s) AS submission,
    to_jsonb(v) AS variant,
    to_jsonb(iq) || to_jsonb(iqnag) AS instance_question,
    to_jsonb(q) AS question,
    to_jsonb(aq) AS assessment_question,
    to_jsonb(ai) AS assessment_instance,
    to_jsonb(a) AS assessment,
    to_jsonb(aset) AS assessment_set,
    to_jsonb(ci) AS course_instance,
    to_jsonb(c) AS course,
    to_jsonb(ci) AS course_instance,
    gj.id AS grading_job_id,
    grading_job_status(gj.id) AS grading_job_status,
    format_date_full_compact(s.date, coalesce(ci.display_timezone, c.display_timezone)) AS formatted_date,
    (
        SELECT count(*)
        FROM submissions AS s2
        WHERE s2.variant_id = s.variant_id
        AND s2.date < s.date
    ) + 1 AS submission_index,
    (
        SELECT count(*)
        FROM submissions AS s2
        WHERE s2.variant_id = s.variant_id
    ) AS submission_count
FROM
    grading_jobs AS gj
    JOIN submissions AS s ON (s.id = gj.submission_id)
    JOIN variants AS v ON (v.id = s.variant_id)
    LEFT JOIN instance_questions AS iq ON (iq.id = v.instance_question_id)
    JOIN questions AS q ON (q.id = v.question_id)
    LEFT JOIN assessment_questions AS aq ON (iq.assessment_question_id = aq.id)
    LEFT JOIN assessment_instances AS ai ON (ai.id = iq.assessment_instance_id)
    LEFT JOIN assessments AS a ON (a.id = ai.assessment_id)
    LEFT JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
    LEFT JOIN course_instances AS ci ON (ci.id = v.course_instance_id)
    JOIN pl_courses AS c ON (c.id = q.course_id)
    JOIN LATERAL instance_questions_next_allowed_grade(iq.id) AS iqnag ON TRUE
WHERE
    s.id = $submission_id
    AND gj.id = (
        SELECT MAX(gj2.id)
        FROM submissions AS s
        LEFT JOIN grading_jobs AS gj2 ON (gj2.submission_id = s.id)
        WHERE s.id = $submission_id
    );

-- BLOCK select_assessment_for_submission
SELECT
    ai.id AS assessment_instance_id
FROM
    submissions AS s
    JOIN variants AS v ON (v.id = s.variant_id)
    LEFT JOIN instance_questions AS iq ON (iq.id = v.instance_question_id)
    LEFT JOIN assessment_instances AS ai ON (ai.id = iq.assessment_instance_id)
WHERE
    s.id = $submission_id;

-- BLOCK select_workspace_id
SELECT
    w.id AS workspace_id
FROM
    variants AS v
    JOIN workspaces AS w ON (v.workspace_id = w.id)
WHERE v.id = $variant_id;

--BLOCK select_graded_submissions_and_other_data
SELECT s.*, v.variant_seed, v.options, v.question_id, ci.course_id, aq.init_points, q.qid, iq.assessment_instance_id
FROM submissions AS s
JOIN variants AS v ON (v.id = s.variant_id)
JOIN course_instances AS ci ON (ci.id = v.course_instance_id)
LEFT JOIN instance_questions AS iq ON (iq.id = v.instance_question_id)
JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
JOIN questions AS q ON (q.id = aq.question_id)
WHERE iq.id = $instance_question_id AND s.graded_at IS NOT NULL AND s.gradable
ORDER BY s.id ASC;

--BLOCK select_course
SELECT c.*
FROM pl_courses AS c
WHERE c.id = $course_id;

--BLOCK select_question
SELECT q.*
FROM questions AS q
WHERE q.id = $question_id;

--BLOCK select_instance_question
SELECT iq.*
FROM instance_questions AS iq
WHERE iq.id = $instance_question_id;

--BLOCK select_variant
SELECT v.*
FROM variants AS v
WHERE v.id = $variant_id;

--BLOCK select_instance_question_by_variant_id
SELECT iq.*
FROM variants AS v
JOIN instance_questions AS iq ON (v.instance_question_id = iq.id)
WHERE v.id = $variant_id;

--BLOCK reset_instance_question
UPDATE instance_questions AS iq
SET
    open = true,
    status = 'unanswered',
    points = 0,
    score_perc = 0,
    highest_submission_score = 0,
    current_value = $init_points,
    points_list = iq.points_list_original,
    number_attempts = 0,
    variants_points_list = ARRAY[]::double precision[],
    submission_score_array = null,
    incremental_submission_score_array = null,
    modified_at = now()
WHERE
    iq.id = $instance_question_id;

--BLOCK reset_variants
UPDATE variants AS v
SET 
    open = true,
    num_tries = 0
WHERE v.instance_question_id = $instance_question_id;

--BLOCK close_variants
UPDATE variants AS v
SET open = false
WHERE v.instance_question_id = $instance_question_id;

--BLOCK restore_instance_question
UPDATE instance_questions AS iq
SET
    open = $open,
    status = $status,
    points = $points,
    points_in_grading = $points_in_grading,
    score_perc = $score_perc,
    score_perc_in_grading = $score_perc_in_grading,
    highest_submission_score = $highest_submission_score,
    current_value = $current_value,
    points_list = $points_list::double precision[],
    variants_points_list = $variants_points_list::double precision[],
    number_attempts = $number_attempts,
    modified_at = now()
WHERE
    iq.id = $id;

--BLOCK reset_instance_assessment
UPDATE assessment_instances AS ai
SET
    points = 0,
    score_perc = 0.0,
    score_perc_in_grading = 0.0
WHERE
    ai.id = $assessment_instance_id;
