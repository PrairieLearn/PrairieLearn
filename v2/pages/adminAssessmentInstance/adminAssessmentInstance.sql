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
WHERE
    ai.id = $assessment_instance_id
    AND auth_admin_course_instance(ci.id, $auth);

-- BLOCK select_log
WITH
answer_submissions_log AS (
    SELECT
        'Submission'::TEXT AS event_name,
        'blue3'::TEXT AS event_color,
        format_date_full_compact(s.date) AS date,
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
),
submission_graded_log AS (
    SELECT
        'Grade question'::TEXT AS event_name,
        'orange3'::TEXT AS event_color,
        format_date_full_compact(s.graded_at) AS date,
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
),
begin_log AS (
    SELECT
        'Begin'::TEXT AS event_name,
        'gray3'::TEXT AS event_color,
        format_date_full_compact(ai.date) AS date,
        NULL::TEXT as qid,
        NULL::INTEGER as question_id,
        NULL::JSONB as data
    FROM
        assessment_instances AS ai
    WHERE
        ai.id = $assessment_instance_id
),
finish_log AS (
    SELECT
        'Finish'::TEXT AS event_name,
        'gray3'::TEXT AS event_color,
        format_date_full_compact(ai.closed_at) AS date,
        NULL::TEXT as qid,
        NULL::INTEGER as question_id,
        NULL::JSONB as data
    FROM
        assessment_instances AS ai
    WHERE
        ai.id = $assessment_instance_id
        AND ai.closed_at IS NOT NULL
)
SELECT * FROM answer_submissions_log
UNION
SELECT * FROM submission_graded_log
UNION
SELECT * FROM begin_log
UNION
SELECT * FROM finish_log
ORDER BY date, event_name, question_id;
