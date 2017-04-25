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
    AND v.available -- ensure the variant is still available
FOR UPDATE OF ai;

-- BLOCK update_grading_log_and_submission
WITH updated_grading_log AS (
    UPDATE grading_logs AS gl
    SET
        graded_at = CURRENT_TIMESTAMP,
        grading_started_at = $grading_started_at,
        grading_finished_at = $grading_finished_at,
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
    available = CASE WHEN q.single_variant THEN true ELSE false END
FROM
    instance_questions AS iq
    JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
    JOIN questions AS q ON (q.id = aq.question_id)
 WHERE
    v.id = $variant_id
    AND iq.id = v.instance_question_id;

-- BLOCK update_instance_question_in_grading
UPDATE instance_questions AS iq
SET
    points_in_grading = least(iq.points + iq.current_value, aq.max_points) - iq.points,
    score_perc_in_grading = least(iq.points + iq.current_value, aq.max_points)
        / (CASE WHEN aq.max_points > 0 THEN aq.max_points ELSE 1 END) * 100 - iq.score_perc
FROM
    assessment_questions AS aq
WHERE
    iq.id = $instance_question_id
    AND aq.id = iq.assessment_question_id;
