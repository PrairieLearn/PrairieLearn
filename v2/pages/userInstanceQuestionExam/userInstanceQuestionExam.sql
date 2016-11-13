-- BLOCK get_variant
SELECT
    v.*
FROM
    variants AS v
WHERE
    v.instance_question_id = $instance_question_id
ORDER BY v.date DESC
LIMIT 1;

-- BLOCK select_submissions
SELECT
    s.*,
    format_date_full_compact(s.date) AS formatted_date,
    CASE
        WHEN s.grading_requested_at IS NOT NULL THEN format_interval(now() - s.grading_requested_at)
        ELSE NULL
    END AS elapsed_grading_time
FROM
    submissions AS s
WHERE
    s.variant_id = $variant_id
ORDER BY
    s.date DESC;

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
