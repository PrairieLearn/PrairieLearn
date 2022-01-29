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
                    'gray3'::TEXT AS event_color,
                    ai.date,
                    u.user_id AS auth_user_id,
                    u.uid AS auth_user_uid,
                    NULL::TEXT AS qid,
                    NULL::INTEGER AS question_id,
                    NULL::INTEGER AS instance_question_id,
                    NULL::INTEGER AS variant_id,
                    NULL::INTEGER AS variant_number,
                    NULL::INTEGER AS submission_id,
                    NULL::BIGINT AS log_id,
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
                    2 AS event_order,
                    'New variant'::TEXT AS event_name,
                    'gray1'::TEXT AS event_color,
                    v.date,
                    u.user_id AS auth_user_id,
                    u.uid AS auth_user_uid,
                    q.qid AS qid,
                    q.id AS question_id,
                    iq.id AS instance_question_id,
                    v.id AS variant_id,
                    v.number AS variant_number,
                    NULL::INTEGER AS submission_id,
                    v.id AS log_id,
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
                    iq.assessment_instance_id = ai_id
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
                    v.id AS variant_id,
                    v.number AS variant_number,
                    s.id AS submission_id,
                    s.id AS log_id,
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
                    3.5 AS event_order,
                    'External grading results'::TEXT AS event_name,
                    'blue1'::TEXT AS event_color,
                    gj.graded_at AS date,
                    u.user_id AS auth_user_id,
                    u.uid AS auth_user_uid,
                    q.qid,
                    q.id AS question_id,
                    iq.id AS instance_question_id,
                    v.id AS variant_id,
                    v.number AS variant_number,
                    gj.id AS submission_id,
                    gj.id AS log_id,
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
                    iq.assessment_instance_id = ai_id
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
                    v.id AS variant_id,
                    v.number AS variant_number,
                    gj.id AS submission_id,
                    gj.id AS log_id,
                    jsonb_build_object(
                        'correct', gj.correct,
                        'score', gj.score,
                        'feedback', gj.feedback,
                        'submitted_answer', CASE WHEN include_files THEN s.submitted_answer ELSE (s.submitted_answer - '_files') END,
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
                    iq.assessment_instance_id = ai_id
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
                    v.id AS variant_id,
                    v.number AS variant_number,
                    gj.id AS submission_id,
                    gj.id AS log_id,
                    jsonb_build_object(
                        'correct', gj.correct,
                        'score', gj.score,
                        'feedback', gj.feedback,
                        'submitted_answer', CASE WHEN include_files THEN s.submitted_answer ELSE (s.submitted_answer - '_files') END,
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
                    iq.assessment_instance_id = ai_id
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
                    v.id AS variant_id,
                    v.number AS variant_number,
                    NULL::INTEGER AS submission_id,
                    qsl.id AS log_id,
                    jsonb_build_object(
                        'points', qsl.points,
                        'max_points', qsl.max_points,
                        'score_perc', qsl.score_perc,
                        'correct', s.correct
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
                    iq.assessment_instance_id = ai_id
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
                    NULL::TEXT AS qid,
                    NULL::INTEGER AS question_id,
                    NULL::INTEGER AS instance_question_id,
                    NULL::INTEGER AS variant_id,
                    NULL::INTEGER AS variant_number,
                    NULL::INTEGER AS submission_id,
                    asl.id AS log_id,
                    jsonb_build_object(
                        'points', asl.points,
                        'max_points', asl.max_points,
                        'score_perc', asl.score_perc
                    ) AS data
                FROM
                    assessment_score_logs AS asl
                    LEFT JOIN users AS u ON (u.user_id = asl.auth_user_id)
                WHERE
                    asl.assessment_instance_id = ai_id
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
                    NULL::TEXT AS qid,
                    NULL::INTEGER AS question_id,
                    NULL::INTEGER AS instance_question_id,
                    NULL::INTEGER AS variant_id,
                    NULL::INTEGER AS variant_number,
                    NULL::INTEGER AS submission_id,
                    asl.id AS log_id,
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
                    'green3'::TEXT AS event_color,
                    pvl.date,
                    u.user_id AS auth_user_id,
                    u.uid AS auth_user_uid,
                    q.qid AS qid,
                    q.id AS question_id,
                    iq.id AS instance_question_id,
                    v.id AS variant_id,
                    v.number AS variant_number,
                    NULL::INTEGER AS submission_id,
                    pvl.id AS log_id,
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
                    -- Only include events for the assessment's user or, in case of
                    -- group assessments, for events triggered by any user that at
                    -- some point was part of the group.
                    AND (pvl.authn_user_id = ai.user_id
                         OR (ai.group_id IS NOT NULL
                             AND EXISTS (SELECT 1
                                         FROM group_logs AS gl
                                         WHERE gl.action = 'join'
                                               AND gl.group_id = ai.group_id
                                               AND gl.user_id = pvl.authn_user_id)))
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
                    NULL::TEXT AS qid,
                    NULL::INTEGER AS question_id,
                    NULL::INTEGER AS instance_question_id,
                    NULL::INTEGER AS variant_id,
                    NULL::INTEGER AS variant_number,
                    NULL::INTEGER AS submission_id,
                    pvl.id AS log_id,
                    NULL::JSONB AS data
                FROM
                    page_view_logs AS pvl
                    JOIN users AS u ON (u.user_id = pvl.authn_user_id)
                    JOIN assessment_instances AS ai ON (ai.id = pvl.assessment_instance_id)
                WHERE
                    pvl.assessment_instance_id = ai_id
                    AND pvl.page_type = 'studentAssessmentInstance'
                    -- Only include events for the assessment's user or, in case of
                    -- group assessments, for events triggered by any user that at
                    -- some point was part of the group.
                    AND (pvl.authn_user_id = ai.user_id
                         OR (ai.group_id IS NOT NULL
                             AND EXISTS (SELECT 1
                                         FROM group_logs AS gl
                                         WHERE gl.action = 'join'
                                               AND gl.group_id = ai.group_id
                                               AND gl.user_id = pvl.authn_user_id)))
            )
            UNION
            (
                SELECT
                    10 AS event_order,
                    ('Group ' || gl.action)::TEXT AS event_name,
                    'gray2'::TEXT AS event_color,
                    gl.date,
                    u.user_id AS auth_user_id,
                    u.uid AS auth_user_uid,
                    NULL::TEXT AS qid,
                    NULL::INTEGER AS question_id,
                    NULL::INTEGER AS instance_question_id,
                    NULL::INTEGER AS variant_id,
                    NULL::INTEGER AS variant_number,
                    NULL::INTEGER AS submission_id,
                    gl.id AS log_id,
                    jsonb_build_object('user', gu.uid) AS data
                FROM
                    assessment_instances AS ai
                    JOIN group_logs AS gl ON (gl.group_id = ai.group_id)
                    JOIN users AS u ON (u.user_id = gl.authn_user_id)
                    LEFT JOIN users AS gu ON (gu.user_id = gl.user_id)
                WHERE
                    ai.id = ai_id
            )
            ORDER BY date, event_order, log_id, question_id
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

