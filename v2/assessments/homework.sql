-- BLOCK lock_with_grading_log_id
SELECT
    gl.auth_user_id,
    ((gl.graded_at IS NOT NULL) OR (gl.grading_request_canceled_at IS NOT NULL)) AS grading_not_needed,
    v.id AS variant_id,
    iq.id AS instance_question_id,
    ai.id AS assessment_instance_id,
    s.credit
FROM
    grading_logs AS gl
    JOIN submissions AS s ON (s.id = gl.submission_id)
    JOIN variants AS v ON (v.id = s.variant_id)
    JOIN instance_questions AS iq ON (iq.id = v.instance_question_id)
    JOIN assessment_instances AS ai ON (ai.id = iq.assessment_instance_id)
WHERE
    gl.id = $grading_log_id
FOR UPDATE OF ai;;

--BLOCK lock_with_variant_id
SELECT
    to_jsonb(v.*) AS variant,
    ai.id AS assessment_instance_id
FROM
    variants AS v
    JOIN instance_questions AS iq ON (iq.id = v.instance_question_id)
    JOIN assessment_instances AS ai ON (ai.id = iq.assessment_instance_id)
WHERE
    v.id = $variant_id
    AND iq.id = $instance_question_id -- ensure the variant matches the instance_question
FOR UPDATE OF ai;

-- BLOCK update_grading_log_and_submission
WITH updated_grading_log AS (
    UPDATE grading_logs AS gl
    SET
        graded_at = CURRENT_TIMESTAMP,
        score = $score,
        correct = $correct,
        feedback = $feedback
    WHERE
        gl.id = $grading_log_id
        AND gl.graded_at IS NULL
        AND gl.grading_request_canceled_at IS NULL
    RETURNING
        gl.*
)
UPDATE submissions AS s
SET
    graded_at = gl.graded_at,
    score = gl.score,
    correct = gl.correct,
    feedback = gl.feedback
FROM
    updated_grading_log AS gl
WHERE
    s.id = gl.submission_id;

-- BLOCK update_variant
UPDATE variants AS v
SET
    available = false
WHERE
    v.id = $variant_id;

-- BLOCK update_instance_question
WITH results AS (
    UPDATE instance_questions AS iq
    SET
        points = CASE WHEN $correct THEN least(iq.points + iq.current_value, aq.max_points) ELSE iq.points END,
        points_in_grading = 0,
        score_perc = CASE WHEN $correct THEN least(iq.points + iq.current_value, aq.max_points) / aq.max_points * 100 ELSE iq.score_perc END,
        score_perc_in_grading = 0,
        current_value = CASE WHEN $correct THEN least(iq.current_value + aq.init_points, aq.max_points) ELSE aq.init_points END,
        number_attempts = iq.number_attempts + 1
    FROM
        assessment_questions AS aq
    WHERE
        iq.id = $instance_question_id
        AND aq.id = iq.assessment_question_id
    RETURNING
        iq.*,
        aq.max_points
)
INSERT INTO question_score_logs
        (instance_question_id, auth_user_id, points, max_points,     score_perc)
(
    SELECT
         id,                  $auth_user_id, points, max_points, score_perc
    FROM results
);

-- BLOCK update_instance_question_in_grading
UPDATE instance_questions AS iq
SET
    points_in_grading = least(iq.points + iq.current_value, aq.max_points) - iq.points,
    score_perc_in_grading = least(iq.points + iq.current_value, aq.max_points) / aq.max_points * 100 - iq.score_perc
FROM
    assessment_questions AS aq
WHERE
    iq.id = $instance_question_id
    AND aq.id = iq.assessment_question_id;

-- BLOCK update_assessment_instance_score
WITH results AS (
    UPDATE assessment_instances AS ai
    SET
        points = new_values.points,
        points_in_grading = new_values.points_in_grading,
        score_perc = new_values.score_perc,
        score_perc_in_grading = new_values.score_perc_in_grading
    FROM
        assessment_points_homework($assessment_instance_id, $credit) AS new_values
    WHERE
        ai.id = $assessment_instance_id
    RETURNING ai.*
)
INSERT INTO assessment_score_logs
        (points, points_in_grading, max_points, score_perc,
        score_perc_in_grading, assessment_instance_id, auth_user_id)
(
    SELECT
         points, points_in_grading, max_points, score_perc,
         score_perc_in_grading, id,                    $auth_user_id
    FROM
        results
);

-- BLOCK new_submission
INSERT INTO submissions AS s
    (date,               variant_id,  auth_user_id,  submitted_answer,
     type,  credit,  mode)
VALUES
    (current_timestamp, $variant_id, $auth_user_id, $submitted_answer,
    $type, $credit, $mode)
RETURNING s.id;
