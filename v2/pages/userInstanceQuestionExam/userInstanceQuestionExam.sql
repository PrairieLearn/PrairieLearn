-- BLOCK get_variant
SELECT
    v.*
FROM
    variants AS v
WHERE
    v.instance_question_id = $instance_question_id
ORDER BY v.date DESC
LIMIT 1;

-- BLOCK get_submission
SELECT
    s.*
FROM
    submissions AS s
WHERE
    s.variant_id = $variant_id
ORDER BY s.date DESC
LIMIT 1;

-- BLOCK get_all_submissions
SELECT
    s.*,
    format_date_full_compact(s.date) AS formatted_date
FROM
    submissions AS s
WHERE
    s.variant_id = $variant_id
ORDER BY s.date DESC;

-- BLOCK new_submission
INSERT INTO submissions AS s
    ( variant_id,  auth_user_id,  submitted_answer,  type,  credit,  mode)
VALUES
    ($variant_id, $auth_user_id, $submitted_answer, $type, $credit, $mode)
RETURNING s.*;

-- BLOCK get_instance_question_status
SELECT
    exam_question_status(iq)
FROM
    instance_questions AS iq
WHERE
    iq.id = $instance_question_id;
