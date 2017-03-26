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
        grading_method = $grading_method
    WHERE
        s.id = $submission_id
    RETURNING s.*
)
INSERT INTO grading_logs AS gl
        (submission_id, score, correct, feedback,  auth_user_id,  grading_method)
(
    SELECT
         id,            score, correct, feedback, $auth_user_id, $grading_method
    FROM
        results
)
RETURNING gl.*;

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
UPDATE grading_logs AS gl
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
    AND gl.submission_id = s.id
    AND gl.graded_at IS NULL
    AND gl.grading_requested_at IS NOT NULL
    AND gl.grading_request_canceled_at IS NULL
RETURNING
    gl.id;
    
-- BLOCK insert_grading_log_for_external_grading
INSERT INTO grading_logs AS gl
        (submission_id,  auth_user_id,  grading_method)
(VALUES ($submission_id, $auth_user_id, $grading_method))
RETURNING gl.*;

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
INSERT INTO grading_logs AS gl
        (submission_id, grading_requested_at, auth_user_id,  grading_method)
(
    SELECT
         id,            CURRENT_TIMESTAMP,   $auth_user_id, $grading_method
    FROM
        submission_results
)
RETURNING gl.*;

-- BLOCK update_for_external_grading_job_submission
WITH
grading_log_results AS (
    UPDATE grading_logs AS gl
    SET
        grading_requested_at = CURRENT_TIMESTAMP
    WHERE
        id = $grading_log_id
    RETURNING gl.*
),
submission_results AS (
    UPDATE submissions AS s
    SET
        grading_requested_at = gl.grading_requested_at,
        grading_method = $grading_method
    FROM
        grading_log_results AS gl
    WHERE
        s.id = gl.submission_id
    RETURNING s.*
)
SELECT
    to_jsonb(gl.*) AS grading_log,
    to_jsonb(s.*) AS submission,
    to_jsonb(v.*) AS variant,
    to_jsonb(q.*) AS question,
    to_jsonb(c.*) AS course
FROM
    grading_log_results AS gl
    JOIN submission_results AS s ON (s.id = gl.submission_id)
    JOIN variants AS v ON (v.id = s.variant_id)
    JOIN instance_questions AS iq ON (iq.id = v.instance_question_id)
    JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
    JOIN questions AS q ON (q.id = aq.question_id)
    JOIN pl_courses AS c ON (c.id = q.course_id);
