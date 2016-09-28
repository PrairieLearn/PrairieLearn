-- BLOCK select_and_auth
SELECT
    to_jsonb(c) AS course,
    to_jsonb(ci) AS course_instance,
    to_jsonb(a) AS assessment,
    to_jsonb(aset) AS assessment_set,
    to_jsonb(ai) AS assessment_instance,
    to_jsonb(u) AS user,
    to_jsonb(e) AS enrollment,
    format_interval(aid.duration) AS assessment_instance_duration,
    to_jsonb(aaci) AS auth,
    to_jsonb(auth_u) AS auth_user,
    to_jsonb(auth_e) AS auth_enrollment,
    all_courses(auth_u.id) AS all_courses,
    all_course_instances(c.id, auth_u.id) AS all_course_instances
FROM
    assessment_instances AS ai
    JOIN assessments AS a ON (a.id = ai.assessment_id)
    JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
    JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
    JOIN courses AS c ON (c.id = ci.course_id)
    LEFT JOIN assessment_instance_durations AS aid ON (aid.id = ai.id)
    JOIN users AS u ON (u.id = ai.user_id)
    JOIN enrollments AS e ON (e.user_id = u.id AND e.course_instance_id = ci.id)
    JOIN LATERAL auth_admin_course_instance(ci.id, 'View', $auth_data) AS aaci ON TRUE
    JOIN users AS auth_u ON (auth_u.id = aaci.auth_user_id)
    JOIN enrollments AS auth_e ON (auth_e.user_id = auth_u.id AND auth_e.course_instance_id = ci.id)
WHERE
    ai.id = $assessment_instance_id
    AND aaci.authorized;

-- BLOCK select_log
(
    SELECT
        1 AS event_order,
        'Begin'::TEXT AS event_name,
        'gray3'::TEXT AS event_color,
        format_date_full_compact(ai.date) AS date,
        NULL::integer AS auth_user_id,
        NULL::TEXT AS auth_user_uid,
        NULL::TEXT as qid,
        NULL::INTEGER as question_id,
        NULL::INTEGER as variant_id,
        NULL::INTEGER as variant_number,
        NULL::JSONB as data
    FROM
        assessment_instances AS ai
    WHERE
        ai.id = $assessment_instance_id
)
UNION
(
    SELECT
        2 AS event_order,
        'New variant'::TEXT AS event_name,
        'gray1'::TEXT AS event_color,
        format_date_full_compact(v.date) AS date,
        NULL::integer AS auth_user_id,
        NULL::TEXT AS auth_user_uid,
        q.qid as qid,
        q.id as question_id,
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
    WHERE
        iq.assessment_instance_id = $assessment_instance_id
)
UNION
(
    SELECT
        3 AS event_order,
        'Submission'::TEXT AS event_name,
        'blue3'::TEXT AS event_color,
        format_date_full_compact(s.date) AS date,
        NULL::integer AS auth_user_id,
        NULL::TEXT AS auth_user_uid,
        q.qid,
        q.id AS question_id,
        v.id as variant_id,
        v.number as variant_number,
        jsonb_build_object('submitted_answer', s.submitted_answer) AS data
    FROM
        submissions AS s
        JOIN variants AS v ON (v.id = s.variant_id)
        JOIN instance_questions AS iq ON (iq.id = v.instance_question_id)
        JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
        JOIN questions AS q ON (q.id = aq.question_id)
    WHERE
        iq.assessment_instance_id = $assessment_instance_id
)
UNION
(
    SELECT
        4 AS event_order,
        'Grade submission'::TEXT AS event_name,
        'orange3'::TEXT AS event_color,
        format_date_full_compact(s.graded_at) AS date,
        u.id AS auth_user_id,
        u.uid AS auth_user_uid,
        q.qid,
        q.id AS question_id,
        v.id as variant_id,
        v.number as variant_number,
        jsonb_build_object(
            'correct', gl.correct,
            'score', gl.score,
            'feedback', gl.feedback,
            'submitted_answer', s.submitted_answer,
            'true_answer', v.true_answer
        ) AS data
    FROM
        grading_logs AS gl
        JOIN submissions AS s ON (s.id = gl.submission_id)
        JOIN variants AS v ON (v.id = s.variant_id)
        JOIN instance_questions AS iq ON (iq.id = v.instance_question_id)
        JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
        JOIN questions AS q ON (q.id = aq.question_id)
        LEFT JOIN users AS u ON (u.id = gl.auth_user_id)
    WHERE
        iq.assessment_instance_id = $assessment_instance_id
        AND s.graded_at IS NOT NULL
)
UNION
(
    SELECT
        5 AS event_order,
        'Score question'::TEXT AS event_name,
        'brown1'::TEXT AS event_color,
        format_date_full_compact(qsl.date) AS date,
        u.id AS auth_user_id,
        u.uid AS auth_user_uid,
        q.qid,
        q.id AS question_id,
        NULL::INTEGER as variant_id,
        NULL::INTEGER as variant_number,
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
        LEFT JOIN users AS u ON (u.id = qsl.auth_user_id)
    WHERE
        iq.assessment_instance_id = $assessment_instance_id
)
UNION
(
    SELECT
        6 AS event_order,
        'Score assessment'::TEXT AS event_name,
        'brown3'::TEXT AS event_color,
        format_date_full_compact(date) AS date,
        u.id AS auth_user_id,
        u.uid AS auth_user_uid,
        NULL::TEXT as qid,
        NULL::INTEGER as question_id,
        NULL::INTEGER as variant_id,
        NULL::INTEGER as variant_number,
        jsonb_build_object(
            'points', asl.points,
            'max_points', asl.max_points,
            'score_perc', asl.score_perc
        ) AS data
    FROM
        assessment_score_logs AS asl
        LEFT JOIN users AS u ON (u.id = asl.auth_user_id)
    WHERE
        asl.assessment_instance_id = $assessment_instance_id
)
UNION
(
    SELECT
        7 AS event_order,
        CASE WHEN asl.open THEN 'Open'::TEXT ELSE 'Close'::TEXT END AS event_name,
        'gray3'::TEXT AS event_color,
        format_date_full_compact(asl.date) AS date,
        u.id AS auth_user_id,
        u.uid AS auth_user_uid,
        NULL::TEXT as qid,
        NULL::INTEGER as question_id,
        NULL::INTEGER as variant_id,
        NULL::INTEGER as variant_number,
        NULL::JSONB as data
    FROM
        assessment_state_logs AS asl
        LEFT JOIN users AS u ON (u.id = asl.auth_user_id)
    WHERE
        asl.assessment_instance_id = $assessment_instance_id
)
ORDER BY date, event_order, question_id;
