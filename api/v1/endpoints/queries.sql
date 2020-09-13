-- BLOCK select_assessments
WITH object_data AS (
    SELECT
        a.id AS assessment_id,
        a.tid AS assessment_name,
        (aset.abbreviation || a.number) AS assessment_label,
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
        a.title AS assessment_title,
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

-- BLOCK select_assessment_access_rules
WITH object_data AS (
    SELECT
        a.id AS assessment_id,
        a.tid AS assessment_name,
        a.title AS assessment_title,
        (aset.abbreviation || a.number) AS assessment_label,
        aset.abbreviation AS assessment_set_abbreviation,
        a.number AS assessment_number,
        aar.credit,
        format_date_iso8601(aar.end_date, ci.display_timezone) AS end_date,
        aar.exam_uuid,
        aar.id AS assessment_access_rule_id,
        aar.mode,
        aar.number,
        aar.number AS assessment_access_rule_number,
        aar.password,
        aar.role,
        aar.seb_config,
        aar.show_closed_assessment,
        format_date_iso8601(aar.start_date, ci.display_timezone) AS start_date,
        aar.time_limit_min,
        aar.uids
    FROM
        assessments AS a
        JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
        JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
        JOIN assessment_access_rules AS aar ON (aar.assessment_id = a.id)
    WHERE
        ci.id = $course_instance_id
        AND a.id = $assessment_id
)
SELECT
    coalesce(jsonb_agg(
        to_jsonb(object_data)
        ORDER BY assessment_access_rule_number, assessment_access_rule_id
    ), '[]'::jsonb) AS item
FROM
    object_data;

-- BLOCK select_instance_questions
WITH object_data AS (
    SELECT
        q.id AS question_id,
        q.qid AS question_name,
        iq.id AS instance_question_id,
        iq.number AS instance_question_number,
        aq.max_points AS assessment_question_max_points,
        iq.points AS instance_question_points,
        iq.score_perc AS instance_question_score_perc
    FROM
        assessment_instances AS ai
        JOIN instance_questions AS iq ON (iq.assessment_instance_id = ai.id)
        JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
        JOIN questions AS q ON (q.id = aq.question_id)
    WHERE
        ai.id = $assessment_instance_id
)
SELECT
    coalesce(jsonb_agg(
        to_jsonb(object_data)
        ORDER BY instance_question_id
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
        v.true_answer,
        v.options,
        format_date_iso8601(s.date, ci.display_timezone) AS date,
        s.submitted_answer,
        s.partial_scores,
        s.override_score,
        s.credit,
        s.mode,
        format_date_iso8601(s.grading_requested_at, ci.display_timezone) AS grading_requested_at,
        format_date_iso8601(s.graded_at, ci.display_timezone) AS graded_at,
        s.score,
        s.correct,
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

-- BLOCK select_log
WITH
event_log AS (
    (
        SELECT
            1 AS event_order,
            'Begin'::TEXT AS event_name,
            ai.date,
            u.user_id AS auth_user_id,
            u.uid AS auth_user_uid,
            NULL::TEXT as qid,
            NULL::INTEGER as question_id,
            NULL::INTEGER as instance_question_id,
            NULL::INTEGER as variant_id,
            NULL::INTEGER as variant_number,
            NULL::INTEGER as submission_id,
            NULL::JSONB as data
        FROM
            assessment_instances AS ai
            LEFT JOIN users AS u ON (u.user_id = ai.auth_user_id)
        WHERE
            ai.id = $assessment_instance_id
    )
    UNION
    (
        SELECT
            2 AS event_order,
            'New variant'::TEXT AS event_name,
            v.date,
            u.user_id AS auth_user_id,
            u.uid AS auth_user_uid,
            q.qid as qid,
            q.id as question_id,
            iq.id AS instance_question_id,
            v.id AS variant_id,
            v.number AS variant_number,
            NULL::INTEGER as submission_id,
            jsonb_build_object(
                'variant_seed', v.variant_seed,
                'params', v.params,
                'true_answer', v.true_answer,
                'options', v.options
            ) AS data
        FROM
            variants AS v
            JOIN instance_questions AS iq ON (iq.id = v.instance_question_id)
            JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
            JOIN questions AS q ON (q.id = aq.question_id)
            LEFT JOIN users AS u ON (u.user_id = v.authn_user_id)
        WHERE
            iq.assessment_instance_id = $assessment_instance_id
    )
    UNION
    (
        SELECT
            3 AS event_order,
            'Submission'::TEXT AS event_name,
            s.date,
            u.user_id AS auth_user_id,
            u.uid AS auth_user_uid,
            q.qid,
            q.id AS question_id,
            iq.id AS instance_question_id,
            v.id as variant_id,
            v.number as variant_number,
            s.id as submission_id,
            jsonb_build_object('submitted_answer', s.submitted_answer) AS data
        FROM
            submissions AS s
            JOIN variants AS v ON (v.id = s.variant_id)
            JOIN instance_questions AS iq ON (iq.id = v.instance_question_id)
            JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
            JOIN questions AS q ON (q.id = aq.question_id)
            LEFT JOIN users AS u ON (u.user_id = s.auth_user_id)
        WHERE
            iq.assessment_instance_id = $assessment_instance_id
    )
    UNION
    (
        SELECT
            3.5 AS event_order,
            'External grading results'::TEXT AS event_name,
            gj.graded_at AS date,
            u.user_id AS auth_user_id,
            u.uid AS auth_user_uid,
            q.qid,
            q.id AS question_id,
            iq.id AS instance_question_id,
            v.id as variant_id,
            v.number as variant_number,
            gj.id as submission_id,
            to_jsonb(gj.*) AS data
        FROM
            grading_jobs AS gj
            JOIN submissions AS s ON (s.id = gj.submission_id)
            JOIN variants AS v ON (v.id = s.variant_id)
            JOIN instance_questions AS iq ON (iq.id = v.instance_question_id)
            JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
            JOIN questions AS q ON (q.id = aq.question_id)
            LEFT JOIN users AS u ON (u.user_id = s.auth_user_id)
        WHERE
            iq.assessment_instance_id = $assessment_instance_id
            AND gj.grading_method = 'External'
            AND gj.graded_at IS NOT NULL
    )
    UNION
    (
        SELECT
            3.7 AS event_order,
            'Manual grading results'::TEXT AS event_name,
            gj.graded_at AS date,
            u.user_id AS auth_user_id,
            u.uid AS auth_user_uid,
            q.qid,
            q.id AS question_id,
            iq.id AS instance_question_id,
            v.id as variant_id,
            v.number as variant_number,
            gj.id as submission_id,
            jsonb_build_object(
                'correct', gj.correct,
                'score', gj.score,
                'feedback', gj.feedback,
                'submitted_answer', s.submitted_answer,
                'submission_id', s.id
            ) AS data
        FROM
            grading_jobs AS gj
            JOIN submissions AS s ON (s.id = gj.submission_id)
            JOIN variants AS v ON (v.id = s.variant_id)
            JOIN instance_questions AS iq ON (iq.id = v.instance_question_id)
            JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
            JOIN questions AS q ON (q.id = aq.question_id)
            LEFT JOIN users AS u ON (u.user_id = gj.auth_user_id)
        WHERE
            iq.assessment_instance_id = $assessment_instance_id
            AND gj.grading_method = 'Manual'
            AND gj.graded_at IS NOT NULL
    )
    UNION
    (
        SELECT
            4 AS event_order,
            'Grade submission'::TEXT AS event_name,
            gj.graded_at AS date,
            u.user_id AS auth_user_id,
            u.uid AS auth_user_uid,
            q.qid,
            q.id AS question_id,
            iq.id AS instance_question_id,
            v.id as variant_id,
            v.number as variant_number,
            gj.id as submission_id,
            jsonb_build_object(
                'correct', gj.correct,
                'score', gj.score,
                'feedback', gj.feedback,
                'submitted_answer', s.submitted_answer,
                'true_answer', v.true_answer
            ) AS data
        FROM
            grading_jobs AS gj
            JOIN submissions AS s ON (s.id = gj.submission_id)
            JOIN variants AS v ON (v.id = s.variant_id)
            JOIN instance_questions AS iq ON (iq.id = v.instance_question_id)
            JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
            JOIN questions AS q ON (q.id = aq.question_id)
            LEFT JOIN users AS u ON (u.user_id = gj.auth_user_id)
        WHERE
            iq.assessment_instance_id = $assessment_instance_id
            AND gj.grading_method = 'Internal'
            AND gj.graded_at IS NOT NULL
    )
    UNION
    (
        SELECT
            5 AS event_order,
            'Score question'::TEXT AS event_name,
            qsl.date,
            u.user_id AS auth_user_id,
            u.uid AS auth_user_uid,
            q.qid,
            q.id AS question_id,
            iq.id AS instance_question_id,
            v.id as variant_id,
            v.number as variant_number,
            NULL::INTEGER as submission_id,
            jsonb_build_object(
                'points', qsl.points,
                'max_points', qsl.max_points,
                'score_perc', qsl.score_perc
            ) AS data
        FROM
            question_score_logs AS qsl
            JOIN instance_questions AS iq ON (iq.id = qsl.instance_question_id)
            JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
            JOIN questions AS q ON (q.id = aq.question_id)
            LEFT JOIN users AS u ON (u.user_id = qsl.auth_user_id)
            LEFT JOIN grading_jobs AS gj ON (gj.id = qsl.grading_job_id)
            LEFT JOIN submissions AS s ON (s.id = gj.submission_id)
            LEFT JOIN variants AS v ON (v.id = s.variant_id)
        WHERE
            iq.assessment_instance_id = $assessment_instance_id
    )
    UNION
    (
        SELECT
            6 AS event_order,
            'Score assessment'::TEXT AS event_name,
            asl.date,
            u.user_id AS auth_user_id,
            u.uid AS auth_user_uid,
            NULL::TEXT as qid,
            NULL::INTEGER as question_id,
            NULL::INTEGER as instance_question_id,
            NULL::INTEGER as variant_id,
            NULL::INTEGER as variant_number,
            NULL::INTEGER as submission_id,
            jsonb_build_object(
                'points', asl.points,
                'max_points', asl.max_points,
                'score_perc', asl.score_perc
            ) AS data
        FROM
            assessment_score_logs AS asl
            LEFT JOIN users AS u ON (u.user_id = asl.auth_user_id)
        WHERE
            asl.assessment_instance_id = $assessment_instance_id
    )
    UNION
    (
        SELECT
            7 AS event_order,
            CASE WHEN asl.open THEN 'Open'::TEXT ELSE 'Close'::TEXT END AS event_name,
            asl.date,
            u.user_id AS auth_user_id,
            u.uid AS auth_user_uid,
            NULL::TEXT as qid,
            NULL::INTEGER as question_id,
            NULL::INTEGER as instance_question_id,
            NULL::INTEGER as variant_id,
            NULL::INTEGER as variant_number,
            NULL::INTEGER as submission_id,
            NULL::JSONB as data
        FROM
            assessment_state_logs AS asl
            LEFT JOIN users AS u ON (u.user_id = asl.auth_user_id)
        WHERE
            asl.assessment_instance_id = $assessment_instance_id
    )
    UNION
    (
        SELECT
            8 AS event_order,
            'View variant'::TEXT AS event_name,
            pvl.date,
            u.user_id AS auth_user_id,
            u.uid AS auth_user_uid,
            q.qid as qid,
            q.id as question_id,
            iq.id AS instance_question_id,
            v.id AS variant_id,
            v.number AS variant_number,
            NULL::INTEGER as submission_id,
            NULL::JSONB as data
        FROM
            page_view_logs AS pvl
            JOIN variants AS v ON (v.id = pvl.variant_id)
            JOIN instance_questions AS iq ON (iq.id = v.instance_question_id)
            JOIN questions AS q ON (q.id = pvl.question_id)
            JOIN users AS u ON (u.user_id = pvl.authn_user_id)
            JOIN assessment_instances AS ai ON (ai.id = pvl.assessment_instance_id)
        WHERE
            pvl.assessment_instance_id = $assessment_instance_id
            AND pvl.page_type = 'studentInstanceQuestion'
            AND pvl.authn_user_id = ai.user_id
    )
    UNION
    (
        SELECT
            9 AS event_order,
            'View assessment overview'::TEXT AS event_name,
            pvl.date,
            u.user_id AS auth_user_id,
            u.uid AS auth_user_uid,
            NULL::TEXT as qid,
            NULL::INTEGER as question_id,
            NULL::INTEGER as instance_question_id,
            NULL::INTEGER as variant_id,
            NULL::INTEGER as variant_number,
            NULL::INTEGER as submission_id,
            NULL::JSONB as data
        FROM
            page_view_logs AS pvl
            JOIN users AS u ON (u.user_id = pvl.authn_user_id)
            JOIN assessment_instances AS ai ON (ai.id = pvl.assessment_instance_id)
        WHERE
            pvl.assessment_instance_id = $assessment_instance_id
            AND pvl.page_type = 'studentAssessmentInstance'
            AND pvl.authn_user_id = ai.user_id
    )
    ORDER BY date, event_order, question_id
),
question_data AS (
    SELECT
        iq.id AS instance_question_id,
        qo.question_number AS student_question_number,
        admin_assessment_question_number(aq.id) as instructor_question_number
    FROM
        instance_questions AS iq
        JOIN assessment_instances AS ai ON (ai.id = iq.assessment_instance_id)
        JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
        JOIN question_order(ai.id) AS qo ON (qo.instance_question_id = iq.id)
    WHERE
        ai.id = $assessment_instance_id
),
score_data AS (
    SELECT
        s.id AS submission_id,
        u.user_id,
        q.id AS question_id,
        u.uid AS user_uid,
        u.name AS user_name,
        a.id AS assessment_id,
        ai.id AS assessment_instance_id,
        ai.number AS assessment_instance_number,
        v.id AS variant_id,
        iq.id AS instance_question_id,
        jsonb_build_object(
          'number', iq.number,
          'max_points', aq.max_points,
          'points', iq.points, 
          'score_perc', iq.score_perc,
          'true_answer', v.true_answer,
          'submitted_answer', s.submitted_answer,
          'partial_scores', s.partial_scores,
          'graded_at', format_date_iso8601(s.graded_at, ci.display_timezone),
          'score', s.score,
          'correct', s.correct,
          'feedback', s.feedback,
          'final_submission_per_variant', (row_number() OVER (PARTITION BY v.id ORDER BY s.date DESC, s.id DESC)) = 1,
          'best_submission_per_variant', (row_number() OVER (PARTITION BY v.id ORDER BY s.score DESC, s.id DESC)) = 1
        ) as data
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
)
SELECT
    el.event_name,
    el.date,
    el.auth_user_id,
    qd.student_question_number,
    qd.instructor_question_number,
    format_date_full_compact(el.date, ci.display_timezone) AS formatted_date,
    format_date_iso8601(el.date, ci.display_timezone) AS date_iso8601,
    el.data::jsonb || sd.data::jsonb as data
FROM
    event_log AS el
    LEFT JOIN question_data AS qd ON (qd.instance_question_id = el.instance_question_id)
    LEFT JOIN score_data AS sd on (el.submission_id = sd.submission_id)
    ,
    assessment_instances AS ai
    JOIN assessments AS a ON (a.id = ai.assessment_id)
    JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
WHERE
    ci.id = $course_instance_id AND 
    ai.id = $assessment_instance_id;
