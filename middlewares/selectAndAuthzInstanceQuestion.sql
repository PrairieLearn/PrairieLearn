-- BLOCK select_and_auth
WITH instance_questions_info AS (
    SELECT
        iq.id,
        (lag(iq.id) OVER w) AS prev_instance_question_id,
        (lead(iq.id) OVER w) AS next_instance_question_id,
        qo.question_number
    FROM
        assessment_instances AS ai
        JOIN assessments AS a ON (a.id = ai.assessment_id)
        JOIN instance_questions AS iq ON (iq.assessment_instance_id = ai.id)
        JOIN question_order(ai.id) AS qo ON (qo.instance_question_id = iq.id)
        JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
    WHERE
        ai.id IN (SELECT assessment_instance_id FROM instance_questions WHERE id = $instance_question_id)
    WINDOW
        w AS (ORDER BY qo.row_order)
)
SELECT
    jsonb_set(to_jsonb(ai), '{formatted_date}',
        to_jsonb(format_date_full_compact(ai.date, COALESCE(ci.display_timezone, c.display_timezone)))) AS assessment_instance,
    CASE
        WHEN ai.date_limit IS NULL THEN NULL
        ELSE floor(extract(epoch from (date_limit - $req_date::timestamptz)) * 1000)
    END AS assessment_instance_remaining_ms,
    CASE
        WHEN ai.date_limit IS NULL THEN NULL
        ELSE floor(extract(epoch from (ai.date_limit - ai.date)) * 1000)
    END AS assessment_instance_time_limit_ms,
    to_jsonb(u) AS instance_user,
    coalesce(to_jsonb(e), '{}'::jsonb) AS instance_enrollment,
    to_jsonb(iq) AS instance_question,
    jsonb_build_object(
        'id', iqi.id,
        'prev_instance_question_id', iqi.prev_instance_question_id,
        'next_instance_question_id', next_instance_question_id,
        'question_number', question_number,
        'max_points', CASE
            WHEN a.type = 'Exam' THEN COALESCE(iq.points_list[1], 0)
            ELSE aq.max_points
        END,
        'remaining_points', iq.points_list[(iq.number_attempts + 2):array_length(iq.points_list, 1)]
    ) AS instance_question_info,
    to_jsonb(aq) AS assessment_question,
    to_jsonb(q) AS question,
    to_jsonb(a) AS assessment,
    to_jsonb(aset) AS assessment_set,
    to_jsonb(aai) AS authz_result,
    assessment_instance_label(ai, a, aset) AS assessment_instance_label
FROM
    instance_questions AS iq
    JOIN instance_questions_info AS iqi ON (iqi.id = iq.id)
    JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
    JOIN questions AS q ON (q.id = aq.question_id)
    JOIN assessment_instances AS ai ON (ai.id = iq.assessment_instance_id)
    JOIN assessments AS a ON (a.id = ai.assessment_id)
    JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
    JOIN pl_courses AS c ON (c.id = ci.course_id)
    JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
    JOIN users AS u ON (u.user_id = ai.user_id)
    LEFT JOIN enrollments AS e ON (e.user_id = u.user_id AND e.course_instance_id = ci.id)
    JOIN LATERAL authz_assessment_instance(ai.id, $authz_data, $req_date, ci.display_timezone) AS aai ON TRUE
WHERE
    iq.id = $instance_question_id
    AND ci.id = $course_instance_id
    AND aai.authorized;
