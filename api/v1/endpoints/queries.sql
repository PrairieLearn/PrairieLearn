-- BLOCK select_assessments
WITH object_data AS (
    SELECT
        a.id AS assessment_id,
        a.tid AS assessment_name,
        (aset.abbreviation || a.number) as assessment_label,
        a.type,
        a.number AS assessment_number,
        a.order_by AS assessment_order_by,
        a.title,
        a.assessment_set_id,
        aset.abbreviation AS assessment_set_abbreviation,
        aset.name AS assessment_set_name,
        aset.number AS assessment_set_number,
        aset.heading AS assessment_set_heading,
        aset.color AS assessment_set_color
    FROM
        assessments AS a
        JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
        LEFT JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
    WHERE
        ci.id = $course_instance_id
        AND a.deleted_at IS NULL
        AND ($assessment_id::bigint IS NULL OR a.id = $assessment_id)
)
SELECT
    coalesce(jsonb_agg(
        to_jsonb(object_data)
        ORDER BY assessment_set_number, assessment_order_by, assessment_id
    ), '[]'::jsonb) AS item
FROM
    object_data;

-- BLOCK select_assessment_instances
WITH object_data AS (
    SELECT
        ai.id AS assessment_instance_id,
        a.id AS assessment_id,
        a.tid AS assessment_name,
        (aset.abbreviation || a.number) AS assessment_label,
        aset.abbreviation AS assessment_set_abbreviation,
        a.number AS assessment_number,
        u.user_id,
        u.uid AS user_uid,
        u.name AS user_name,
        coalesce(e.role, 'None'::enum_role) AS user_role,
        ai.max_points,
        ai.points,
        ai.score_perc,
        ai.number AS assessment_instance_number,
        ai.open,
        CASE
            WHEN ai.open AND ai.date_limit IS NOT NULL
                THEN greatest(0, floor(extract(epoch from (ai.date_limit - current_timestamp)) / (60 * 1000)))::text || ' min'
            WHEN ai.open THEN 'Open'
            ELSE 'Closed'
        END AS time_remaining,
        format_date_iso8601(ai.date, ci.display_timezone) AS start_date,
        EXTRACT(EPOCH FROM ai.duration) AS duration_seconds,
        (row_number() OVER (PARTITION BY u.user_id ORDER BY score_perc DESC, ai.number DESC, ai.id DESC)) = 1 AS highest_score
    FROM
        assessments AS a
        JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
        JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
        JOIN assessment_instances AS ai ON (ai.assessment_id = a.id)
        JOIN users AS u ON (u.user_id = ai.user_id)
        LEFT JOIN enrollments AS e ON (e.user_id = u.user_id AND e.course_instance_id = a.course_instance_id)
    WHERE
        ci.id = $course_instance_id
        AND ($assessment_id::bigint IS NULL OR a.id = $assessment_id)
        AND ($assessment_instance_id::bigint IS NULL OR ai.id = $assessment_instance_id)
)
SELECT
    coalesce(jsonb_agg(
        to_jsonb(object_data)
        ORDER BY user_role DESC, user_uid, user_id, assessment_instance_number, assessment_instance_id
    ), '[]'::jsonb) AS item
FROM
    object_data;

-- BLOCK select_submissions
WITH object_data AS (
    SELECT
        s.id AS submission_id,
        u.user_id,
        u.uid AS user_uid,
        u.name AS user_name,
        coalesce(e.role, 'None'::enum_role) AS user_role,
        a.id AS assessment_id,
        a.tid AS assessment_name,
        (aset.abbreviation || a.number) AS assessment_label,
        ai.id AS assessment_instance_id,
        ai.number AS assessment_instance_number,
        q.id AS question_id,
        q.qid AS question_name,
        iq.id AS instance_question_id,
        iq.number AS instance_question_number,
        aq.max_points AS assessment_question_max_points,
        iq.points AS instance_question_points,
        iq.score_perc AS instance_question_score_perc,
        v.id AS variant_id,
        v.number AS variant_number,
        v.variant_seed,
        v.params,
        v.true_answer,
        v.options,
        format_date_iso8601(s.date, ci.display_timezone) AS date,
        s.submitted_answer,
        s.override_score,
        s.credit,
        s.mode,
        format_date_iso8601(s.grading_requested_at, ci.display_timezone) AS grading_requested_at,
        format_date_iso8601(s.graded_at, ci.display_timezone) AS graded_at,
        s.score,
        s.correct,
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
        ci.id = $course_instance_id
        AND ($assessment_instance_id::bigint IS NULL OR ai.id = $assessment_instance_id)
        AND ($submission_id::bigint IS NULL OR s.id = $submission_id)
)
SELECT
    coalesce(jsonb_agg(
        to_jsonb(object_data)
        ORDER BY assessment_instance_number, question_name, instance_question_number, variant_number, date, submission_id
    ), '[]'::jsonb) AS item
FROM
    object_data;
