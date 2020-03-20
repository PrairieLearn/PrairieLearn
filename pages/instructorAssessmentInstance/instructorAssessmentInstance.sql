-- BLOCK assessment_instance_stats
SELECT
    iq.id AS instance_question_id,
    q.title,
    q.qid,
    q.id AS question_id,
    admin_assessment_question_number(aq.id) as number,
    iq.some_submission,
    iq.some_perfect_submission,
    iq.some_nonzero_submission,
    iq.first_submission_score,
    iq.last_submission_score,
    iq.max_submission_score,
    iq.average_submission_score,
    iq.submission_score_array,
    iq.incremental_submission_points_array,
    iq.incremental_submission_score_array
FROM
    instance_questions AS iq
    JOIN assessment_instances AS ai ON (ai.id = iq.assessment_instance_id)
    JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
    JOIN questions AS q ON (q.id = aq.question_id)
    JOIN assessments AS a ON (ai.assessment_id = a.id)
    JOIN course_instances AS ci ON (a.course_instance_id = ci.id)
    JOIN enrollments AS e ON (ai.user_id = e.user_id AND ci.id = e.course_instance_id)
WHERE
    ai.id=$assessment_instance_id
    AND aq.deleted_at IS NULL
    AND q.deleted_at IS NULL
GROUP BY
    q.id,
    iq.id,
    aq.id,
    ai.id
ORDER BY
    aq.number;

-- BLOCK select_formatted_duration
SELECT
    format_interval(ai.duration) AS assessment_instance_duration
FROM
    assessment_instances AS ai
WHERE
    ai.id = $assessment_instance_id;

-- BLOCK select_instance_questions
SELECT
    iq.*,
    ((lag(z.id) OVER w) IS DISTINCT FROM z.id) AS start_new_zone,
    z.id AS zone_id,
    z.title AS zone_title,
    q.title AS question_title,
    q.id AS question_id,
    q.qid,
    aq.max_points,
    qo.row_order,
    qo.question_number,
    admin_assessment_question_number(aq.id) as instructor_question_number,
    z.max_points AS zone_max_points,
    (z.max_points IS NOT NULL) AS zone_has_max_points,
    z.best_questions AS zone_best_questions,
    (z.best_questions IS NOT NULL) AS zone_has_best_questions
FROM
    instance_questions AS iq
    JOIN assessment_instances AS ai ON (ai.id = iq.assessment_instance_id)
    JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
    JOIN alternative_groups AS ag ON (ag.id = aq.alternative_group_id)
    JOIN zones AS z ON (z.id = ag.zone_id)
    JOIN questions AS q ON (q.id = aq.question_id)
    JOIN question_order(ai.id) AS qo ON (qo.instance_question_id = iq.id)
WHERE
    ai.id = $assessment_instance_id
WINDOW
    w AS (ORDER BY qo.row_order)
ORDER BY qo.row_order;

-- BLOCK select_log
WITH
event_log AS (
    (
        SELECT
            1 AS event_order,
            'Begin'::TEXT AS event_name,
            'gray3'::TEXT AS event_color,
            ai.date,
            u.user_id AS auth_user_id,
            u.uid AS auth_user_uid,
            NULL::TEXT as qid,
            NULL::INTEGER as question_id,
            NULL::INTEGER as instance_question_id,
            NULL::INTEGER as variant_id,
            NULL::INTEGER as variant_number,
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
            'gray1'::TEXT AS event_color,
            v.date,
            u.user_id AS auth_user_id,
            u.uid AS auth_user_uid,
            q.qid as qid,
            q.id as question_id,
            iq.id AS instance_question_id,
            v.id AS variant_id,
            v.number AS variant_number,
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
            'blue3'::TEXT AS event_color,
            s.date,
            u.user_id AS auth_user_id,
            u.uid AS auth_user_uid,
            q.qid,
            q.id AS question_id,
            iq.id AS instance_question_id,
            v.id as variant_id,
            v.number as variant_number,
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
            'blue1'::TEXT AS event_color,
            gj.graded_at AS date,
            u.user_id AS auth_user_id,
            u.uid AS auth_user_uid,
            q.qid,
            q.id AS question_id,
            iq.id AS instance_question_id,
            v.id as variant_id,
            v.number as variant_number,
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
            'blue2'::TEXT AS event_color,
            gj.graded_at AS date,
            u.user_id AS auth_user_id,
            u.uid AS auth_user_uid,
            q.qid,
            q.id AS question_id,
            iq.id AS instance_question_id,
            v.id as variant_id,
            v.number as variant_number,
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
            'orange3'::TEXT AS event_color,
            gj.graded_at AS date,
            u.user_id AS auth_user_id,
            u.uid AS auth_user_uid,
            q.qid,
            q.id AS question_id,
            iq.id AS instance_question_id,
            v.id as variant_id,
            v.number as variant_number,
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
            'brown1'::TEXT AS event_color,
            qsl.date,
            u.user_id AS auth_user_id,
            u.uid AS auth_user_uid,
            q.qid,
            q.id AS question_id,
            iq.id AS instance_question_id,
            v.id as variant_id,
            v.number as variant_number,
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
            'brown3'::TEXT AS event_color,
            asl.date,
            u.user_id AS auth_user_id,
            u.uid AS auth_user_uid,
            NULL::TEXT as qid,
            NULL::INTEGER as question_id,
            NULL::INTEGER as instance_question_id,
            NULL::INTEGER as variant_id,
            NULL::INTEGER as variant_number,
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
            'gray3'::TEXT AS event_color,
            asl.date,
            u.user_id AS auth_user_id,
            u.uid AS auth_user_uid,
            NULL::TEXT as qid,
            NULL::INTEGER as question_id,
            NULL::INTEGER as instance_question_id,
            NULL::INTEGER as variant_id,
            NULL::INTEGER as variant_number,
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
            'green3'::TEXT AS event_color,
            pvl.date,
            u.user_id AS auth_user_id,
            u.uid AS auth_user_uid,
            q.qid as qid,
            q.id as question_id,
            iq.id AS instance_question_id,
            v.id AS variant_id,
            v.number AS variant_number,
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
            'green1'::TEXT AS event_color,
            pvl.date,
            u.user_id AS auth_user_id,
            u.uid AS auth_user_uid,
            NULL::TEXT as qid,
            NULL::INTEGER as question_id,
            NULL::INTEGER as instance_question_id,
            NULL::INTEGER as variant_id,
            NULL::INTEGER as variant_number,
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
)
SELECT
    el.*,
    format_date_full_compact(el.date, ci.display_timezone) AS formatted_date,
    format_date_iso8601(el.date, ci.display_timezone) AS date_iso8601,
    qd.student_question_number,
    qd.instructor_question_number
FROM
    event_log AS el
    LEFT JOIN question_data AS qd ON (qd.instance_question_id = el.instance_question_id)
    ,
    assessment_instances AS ai
    JOIN assessments AS a ON (a.id = ai.assessment_id)
    JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
WHERE
    ai.id = $assessment_instance_id;
