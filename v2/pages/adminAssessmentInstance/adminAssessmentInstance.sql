-- BLOCK select_and_auth
SELECT
    to_jsonb(c) AS course,
    to_jsonb(ci) AS course_instance,
    to_jsonb(a) AS assessment,
    to_jsonb(aset) AS assessment_set,
    to_jsonb(ai) AS assessment_instance,
    to_jsonb(u) AS instance_user,
    to_jsonb(e) AS enrollment,
    format_interval(aid.duration) AS assessment_instance_duration
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
WHERE
    ai.id = $assessment_instance_id
    AND aaci.authorized;

-- BLOCK select_log
(
    SELECT
        'Submission'::TEXT AS event_name,
        'blue3'::TEXT AS event_color,
        format_date_full_compact(s.date) AS date,
        NULL::integer AS auth_user_id,
        NULL::TEXT AS auth_user_uid,
        q.qid,
        q.id AS question_id,
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
        'Grade question'::TEXT AS event_name,
        'orange3'::TEXT AS event_color,
        format_date_full_compact(s.graded_at) AS date,
        NULL::integer AS auth_user_id,
        NULL::TEXT AS auth_user_uid,
        q.qid,
        q.id AS question_id,
        jsonb_build_object(
            'correct', s.correct,
            'feedback', s.feedback,
            'submitted_answer', s.submitted_answer,
            'true_answer', v.true_answer
        ) AS data
    FROM
        submissions AS s
        JOIN variants AS v ON (v.id = s.variant_id)
        JOIN instance_questions AS iq ON (iq.id = v.instance_question_id)
        JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
        JOIN questions AS q ON (q.id = aq.question_id)
    WHERE
        iq.assessment_instance_id = $assessment_instance_id
        AND s.graded_at IS NOT NULL
)
UNION
(
    SELECT
        'Begin'::TEXT AS event_name,
        'gray3'::TEXT AS event_color,
        format_date_full_compact(ai.date) AS date,
        NULL::integer AS auth_user_id,
        NULL::TEXT AS auth_user_uid,
        NULL::TEXT as qid,
        NULL::INTEGER as question_id,
        NULL::JSONB as data
    FROM
        assessment_instances AS ai
    WHERE
        ai.id = $assessment_instance_id
)
UNION
(
    SELECT
        'Finish'::TEXT AS event_name,
        'gray3'::TEXT AS event_color,
        format_date_full_compact(ai.closed_at) AS date,
        NULL::integer AS auth_user_id,
        NULL::TEXT AS auth_user_uid,
        NULL::TEXT as qid,
        NULL::INTEGER as question_id,
        NULL::JSONB as data
    FROM
        assessment_instances AS ai
    WHERE
        ai.id = $assessment_instance_id
        AND ai.closed_at IS NOT NULL
)
UNION
(
    SELECT
        CASE WHEN asl.open THEN 'Open'::TEXT ELSE 'Close'::TEXT END AS event_name,
        'gray3'::TEXT AS event_color,
        format_date_full_compact(asl.date) AS date,
        u.id AS auth_user_id,
        u.uid AS auth_user_uid,
        NULL::TEXT as qid,
        NULL::INTEGER as question_id,
        NULL::JSONB as data
    FROM
        assessment_state_logs AS asl
        JOIN users AS u ON (u.id = asl.auth_user_id)
    WHERE
        asl.assessment_instance_id = $assessment_instance_id
)
ORDER BY date, event_name, question_id;
