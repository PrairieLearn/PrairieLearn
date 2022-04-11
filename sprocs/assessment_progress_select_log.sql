CREATE FUNCTION
    assessment_instances_select_log ( 
        ai_id bigint,
        include_files boolean
    ) 
    RETURNS TABLE(
        event_name text,
        event_color text,
        event_date timestamp WITH time zone,
        auth_user_uid text,
        qid text,
        question_id bigint,
        instance_question_id bigint,
        variant_id bigint,
        variant_number integer,
        submission_id bigint,
        data JSONB,
        formatted_date text,
        date_iso8601 text,
        student_question_number text,
        instructor_question_number text
    )
AS $$
BEGIN
    RETURN query
        WITH
        event_log AS (
            (
                SELECT
                    1 AS event_order,
                    'Begin'::TEXT AS event_name,
                    ai.date,
                    u.user_id AS auth_user_id,
                    u.uid AS auth_user_uid,
                    NULL::TEXT AS qid,
                    NULL::INTEGER AS question_id,
                    NULL::INTEGER AS instance_question_id,
                    NULL::INTEGER AS variant_id,
                    NULL::INTEGER AS variant_number,
                    NULL::INTEGER AS submission_id,
                    NULL::JSONB AS data
                FROM
                    assessment_instances AS ai
                    LEFT JOIN users AS u ON (u.user_id = ai.auth_user_id)
                WHERE
                    ai.id = ai_id
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
                    v.id AS variant_id,
                    v.number AS variant_number,
                    s.id AS submission_id,
                    jsonb_build_object(
                      'submitted_answer', CASE WHEN include_files THEN s.submitted_answer ELSE (s.submitted_answer - '_files') END,
                      'correct', s.correct
                    ) AS data
                FROM
                    submissions AS s
                    JOIN variants AS v ON (v.id = s.variant_id)
                    JOIN instance_questions AS iq ON (iq.id = v.instance_question_id)
                    JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
                    JOIN questions AS q ON (q.id = aq.question_id)
                    LEFT JOIN users AS u ON (u.user_id = s.auth_user_id)
                WHERE
                    iq.assessment_instance_id = ai_id
            )
            UNION
            (
                SELECT
                    7 AS event_order,
                    CASE WHEN asl.open THEN 'Open'::TEXT ELSE 'Close'::TEXT END AS event_name,
                    asl.date,
                    u.user_id AS auth_user_id,
                    u.uid AS auth_user_uid,
                    NULL::TEXT AS qid,
                    NULL::INTEGER AS question_id,
                    NULL::INTEGER AS instance_question_id,
                    NULL::INTEGER AS variant_id,
                    NULL::INTEGER AS variant_number,
                    NULL::INTEGER AS submission_id,
                    CASE
                    WHEN asl.open THEN jsonb_build_object(
                         'date_limit',
                         CASE WHEN asl.date_limit IS NULL THEN 'Unlimited'
                         ELSE format_date_full_compact(asl.date_limit, ci.display_timezone)
                         END,
                         'time_limit',
                         CASE WHEN asl.date_limit IS NULL THEN 'Unlimited'
                         ELSE format_interval(asl.date_limit - ai.date)
                         END,
                         'remaining_time',
                         CASE WHEN asl.date_limit IS NULL THEN 'Unlimited'
                         ELSE format_interval(asl.date_limit - asl.date)
                         END
                    )
                    ELSE NULL::JSONB
                    END AS data
                FROM
                    assessment_state_logs AS asl
                    JOIN assessment_instances AS ai ON (ai.id = ai_id)
                    JOIN assessments AS a ON (a.id = ai.assessment_id)
                    JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
                    LEFT JOIN users AS u ON (u.user_id = asl.auth_user_id)
                WHERE
                    asl.assessment_instance_id = ai_id
            )
            UNION
            (
                SELECT
                    8 AS event_order,
                    'View variant'::TEXT AS event_name,
                    pvl.date,
                    u.user_id AS auth_user_id,
                    u.uid AS auth_user_uid,
                    q.qid AS qid,
                    q.id AS question_id,
                    iq.id AS instance_question_id,
                    v.id AS variant_id,
                    v.number AS variant_number,
                    NULL::INTEGER AS submission_id,
                    NULL::JSONB AS data
                FROM
                    page_view_logs AS pvl
                    JOIN variants AS v ON (v.id = pvl.variant_id)
                    JOIN instance_questions AS iq ON (iq.id = v.instance_question_id)
                    JOIN questions AS q ON (q.id = pvl.question_id)
                    JOIN users AS u ON (u.user_id = pvl.authn_user_id)
                    JOIN assessment_instances AS ai ON (ai.id = pvl.assessment_instance_id)
                WHERE
                    pvl.assessment_instance_id = ai_id
                    AND pvl.page_type = 'studentInstanceQuestion'
                    AND pvl.authn_user_id = ai.user_id
            )
            ORDER BY date, event_order, question_id
        ),
        question_data AS (
            SELECT
                iq.id AS instance_question_id,
                qo.question_number AS student_question_number,
                admin_assessment_question_number(aq.id) AS instructor_question_number
            FROM
                instance_questions AS iq
                JOIN assessment_instances AS ai ON (ai.id = iq.assessment_instance_id)
                JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
                JOIN question_order(ai.id) AS qo ON (qo.instance_question_id = iq.id)
            WHERE
                ai.id = ai_id
        )
        SELECT
            el.event_name,
            el.event_color,
            el.date AS event_date,
            el.auth_user_uid,
            el.qid,
            el.question_id,
            el.instance_question_id,
            el.variant_id,
            el.variant_number,
            el.submission_id,
            el.data,
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
            ai.id = ai_id;

END;
$$ LANGUAGE plpgsql STABLE;

