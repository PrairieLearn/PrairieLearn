-- BLOCK get_available_variant
SELECT
    v.*
FROM
    variants AS v
WHERE
    v.instance_question_id = $instance_question_id
    AND (NOT $require_available OR v.available)
ORDER BY v.date DESC
LIMIT 1;

-- BLOCK insert_variant
INSERT INTO variants AS v (authn_user_id, instance_question_id, number, variant_seed, params, true_answer, options, valid)
(
    SELECT
        $authn_user_id,
        $instance_question_id,
        coalesce(max(other_v.number) + 1, 1),
        $variant_seed,
        $question_params,
        $true_answer,
        $options,
        $valid
    FROM
        variants AS other_v
    WHERE
        other_v.instance_question_id = $instance_question_id
)
RETURNING v.*;

-- BLOCK select_submission
SELECT
    s.*
FROM
    submissions AS s
WHERE
    s.id = $submission_id;

-- BLOCK update_submission
WITH results AS (
    UPDATE submissions AS s
    SET
        graded_at = CURRENT_TIMESTAMP,
        score = $score,
        correct = $correct,
        feedback = $feedback,
        partial_scores = $partial_scores,
        submitted_answer = $submitted_answer,
        parse_errors = $parse_errors,
        grading_method = $grading_method
    WHERE
        s.id = $submission_id
    RETURNING s.*
)
INSERT INTO grading_jobs AS gj
        (submission_id, score, correct, feedback,  partial_scores,  auth_user_id,  grading_method)
(
    SELECT
         id,            score, correct, feedback, $partial_scores, $auth_user_id, $grading_method
    FROM
        results
)
RETURNING gj.*;

-- BLOCK update_variant
UPDATE variants AS v
SET
    params = $params,
    true_answer = $true_answer
WHERE
    v.id = $variant_id;

-- BLOCK cancel_outstanding_grading_requests
WITH
cancel_submission_results AS (
    UPDATE submissions AS s
    SET
        grading_requested_at = NULL
    FROM
        submissions AS this_s
        JOIN variants AS this_v ON (this_v.id = this_s.variant_id)
        JOIN instance_questions AS iq ON (iq.id = this_v.instance_question_id)
        JOIN variants AS v ON (v.instance_question_id = iq.id)
    WHERE
        this_s.id = $submission_id
        AND s.variant_id = v.id
        AND s.graded_at IS NULL
        AND s.grading_requested_at IS NOT NULL
)
UPDATE grading_jobs AS gj
SET
    grading_request_canceled_at = CURRENT_TIMESTAMP,
    grading_request_canceled_by = $auth_user_id
FROM
    submissions AS this_s
    JOIN variants AS this_v ON (this_v.id = this_s.variant_id)
    JOIN instance_questions AS iq ON (iq.id = this_v.instance_question_id)
    JOIN variants AS v ON (v.instance_question_id = iq.id)
    JOIN submissions AS s ON (s.variant_id = v.id)
WHERE
    this_s.id = $submission_id
    AND gj.submission_id = s.id
    AND gj.graded_at IS NULL
    AND gj.grading_requested_at IS NOT NULL
    AND gj.grading_request_canceled_at IS NULL
RETURNING
    gj.id;

-- BLOCK insert_grading_job_for_external_grading
INSERT INTO grading_jobs AS gj
        (submission_id,  auth_user_id,  grading_method)
(VALUES ($submission_id, $auth_user_id, $grading_method))
RETURNING gj.*;

-- BLOCK update_submission_for_manual_grading
WITH submission_results AS (
    UPDATE submissions AS s
    SET
        grading_requested_at = CURRENT_TIMESTAMP,
        grading_method = $grading_method
    WHERE
        s.id = $submission_id
    RETURNING s.*
)
INSERT INTO grading_jobs AS gj
        (submission_id, grading_requested_at, auth_user_id,  grading_method)
(
    SELECT
         id,            CURRENT_TIMESTAMP,   $auth_user_id, $grading_method
    FROM
        submission_results
)
RETURNING gj.*;

-- BLOCK update_for_external_grading_job_submission
WITH
grading_job_results AS (
    UPDATE grading_jobs AS gj
    SET
        grading_requested_at = CURRENT_TIMESTAMP
    WHERE
        id = $grading_job_id
    RETURNING gj.*
),
submission_results AS (
    UPDATE submissions AS s
    SET
        grading_requested_at = gj.grading_requested_at,
        grading_method = gj.grading_method
    FROM
        grading_job_results AS gj
    WHERE
        s.id = gj.submission_id
    RETURNING s.*
)
SELECT
    to_jsonb(gj.*) AS grading_job,
    to_jsonb(s.*) AS submission,
    to_jsonb(v.*) AS variant,
    to_jsonb(q.*) AS question,
    to_jsonb(c.*) AS course
FROM
    grading_job_results AS gj
    JOIN submission_results AS s ON (s.id = gj.submission_id)
    JOIN variants AS v ON (v.id = s.variant_id)
    JOIN instance_questions AS iq ON (iq.id = v.instance_question_id)
    JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
    JOIN questions AS q ON (q.id = aq.question_id)
    JOIN pl_courses AS c ON (c.id = q.course_id);
