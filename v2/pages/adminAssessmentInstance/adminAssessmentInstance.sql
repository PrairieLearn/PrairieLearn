-- BLOCK log
WITH
answer_submissions_log AS (
    SELECT
        'Submission'::TEXT AS event,
        s.date,
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
        'Grade question'::TEXT AS event,
        s.graded_at AS date,
        q.qid,
        q.id AS question_id,
        jsonb_build_object('correct', s.correct, 'feedback', s.feedback) AS data
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
        'Begin'::TEXT AS event,
        ai.date,
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
        'Finish'::TEXT AS event,
        ai.closed_at AS date,
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
ORDER BY date, event, question_id;
