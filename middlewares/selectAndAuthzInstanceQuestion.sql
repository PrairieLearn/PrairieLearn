-- BLOCK select_and_auth
WITH instance_questions_info AS (
    SELECT
        iq.id,
        (lag(iq.id) OVER w) AS prev_instance_question_id,
        (lead(iq.id) OVER w) AS next_instance_question_id,
        qo.question_number,
        CASE
            WHEN a.type = 'Exam' THEN COALESCE(iq.points_list[1], 0)
            ELSE aq.max_points
        END AS max_points,
        iq.points_list[(iq.number_attempts + 2):array_length(iq.points_list, 1)] AS remaining_points,
        CASE
            WHEN a.type = 'Exam' THEN exam_question_status(iq)
            ELSE NULL
        END AS status
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
    to_jsonb(ai) AS assessment_instance,
    to_jsonb(u) AS instance_user,
    coalesce(to_jsonb(e), '{}'::jsonb) AS instance_enrollment,
    to_jsonb(iq) AS instance_question,
    to_jsonb(iqi) AS instance_question_info,
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
    JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
    JOIN users AS u ON (u.user_id = ai.user_id)
    LEFT JOIN enrollments AS e ON (e.user_id = u.user_id AND e.course_instance_id = ci.id)
    JOIN LATERAL authz_assessment_instance(ai.id, $authz_data, ci.display_timezone) AS aai ON TRUE
WHERE
    iq.id = $instance_question_id
    AND ci.id = $course_instance_id
    AND aai.authorized;
