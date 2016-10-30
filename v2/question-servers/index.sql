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
        feedback = $feedback
    WHERE
        s.id = $submission_id
    RETURNING s.*
)
INSERT INTO grading_logs
        (submission_id, score, correct, feedback,  auth_user_id)
(
    SELECT
         id,            score, correct, feedback, $auth_user_id
    FROM
        results
);

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
    
-- BLOCK update_submission_for_external_grading
WITH submission_results AS (
    UPDATE submissions AS s
    SET
        grading_requested_at = CURRENT_TIMESTAMP
    WHERE
        s.id = $submission_id
    RETURNING s.*
)
INSERT INTO grading_logs
        (submission_id, grading_requested_at, auth_user_id)
(
    SELECT
         id,            CURRENT_TIMESTAMP,   $auth_user_id
    FROM
        submission_results
);

-- BLOCK update_submission_for_manual_grading
WITH submission_results AS (
    UPDATE submissions AS s
    SET
        grading_requested_at = CURRENT_TIMESTAMP
    WHERE
        s.id = $submission_id
    RETURNING s.*
)
INSERT INTO grading_logs
        (submission_id, grading_requested_at, auth_user_id)
(
    SELECT
         id,            CURRENT_TIMESTAMP,   $auth_user_id
    FROM
        submission_results
);
