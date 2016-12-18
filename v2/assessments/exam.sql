-- BLOCK lock_with_grading_log_id
SELECT
    gl.auth_user_id,
    ((gl.graded_at IS NOT NULL) OR (gl.grading_request_canceled_at IS NOT NULL)) AS grading_not_needed,
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
FOR UPDATE OF ai;

-- BLOCK lock_with_assessment_instance_id
SELECT
    ai.id
FROM
    assessment_instances AS ai
WHERE
    ai.id = $assessment_instance_id
FOR UPDATE OF ai;

-- BLOCK select_work_list
SELECT
    s.id AS submission_id,
    iq.id AS instance_question_id,
    to_jsonb(v) AS variant,
    to_jsonb(q) AS question,
    to_jsonb(c) AS course
FROM
    assessment_instances AS ai
    JOIN instance_questions AS iq ON (iq.assessment_instance_id = ai.id)
    JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
    JOIN questions AS q ON (q.id = aq.question_id)
    JOIN variants AS v ON (v.instance_question_id = iq.id)
    JOIN LATERAL (
        SELECT *
        FROM submissions AS s
        WHERE s.variant_id = v.id
        ORDER BY date DESC
        LIMIT 1
    ) AS s ON (s.variant_id = v.id)
    JOIN assessments AS a ON (a.id = ai.assessment_id)
    JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
    JOIN courses AS c ON (c.id = ci.course_id)
WHERE
    ai.id = $assessment_instance_id
    AND s.score IS NULL
    AND s.grading_requested_at IS NULL;

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

-- BLOCK update_grading_log_and_submission
WITH
updated_grading_log AS (
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

-- BLOCK update_instance_question
WITH results AS (
    UPDATE instance_questions AS iq
    SET
        open = CASE
                    WHEN $correct THEN false
                    ELSE CASE
                            WHEN iq.number_attempts + 1 < array_length(iq.points_list, 1) THEN TRUE
                            ELSE FALSE
                    END
                END,
        points = CASE WHEN $correct THEN iq.current_value ELSE 0 END,
        points_in_grading = 0,
        score_perc = (CASE WHEN $correct THEN iq.current_value ELSE 0 END) / iq.points_list[1] * 100,
        score_perc_in_grading = 0,
        current_value = CASE WHEN $correct THEN NULL ELSE iq.points_list[iq.number_attempts + 2] END,
        number_attempts = iq.number_attempts + 1
    WHERE
        iq.id = $instance_question_id
    RETURNING iq.*
)
INSERT INTO question_score_logs
        (instance_question_id, auth_user_id, points, max_points,     score_perc)
(
    SELECT
         id,                  $auth_user_id, points, points_list[1], score_perc
    FROM results
);

-- BLOCK update_instance_question_in_grading
UPDATE instance_questions AS iq
SET
    points_in_grading = iq.current_value,
    score_perc_in_grading = floor(iq.current_value / iq.points_list[1] * 100)
WHERE
    iq.id = $instance_question_id;

-- BLOCK update_assessment_instance_score
WITH results AS (
    UPDATE assessment_instances AS ai
    SET
        points = new_values.points,
        points_in_grading = new_values.points_in_grading,
        score_perc = new_values.score_perc,
        score_perc_in_grading = new_values.score_perc_in_grading
    FROM
        assessment_points_exam($assessment_instance_id, $credit) AS new_values
    WHERE
        ai.id = $assessment_instance_id
    RETURNING ai.*
)
INSERT INTO assessment_score_logs
        (points, points_in_grading, max_points, score_perc, score_perc_in_grading, assessment_instance_id, auth_user_id)
(
    SELECT
         points, points_in_grading, max_points, score_perc, score_perc_in_grading, id,                    $auth_user_id
    FROM
        results
);

-- BLOCK close_assessment_instance
WITH
last_activity AS (
    SELECT DISTINCT ON (id)
        ai.id,
        coalesce(s.date, ai.date) AS date
    FROM
        assessment_instances AS ai
        JOIN instance_questions AS iq ON (iq.assessment_instance_id = ai.id)
        JOIN variants AS v ON (v.instance_question_id = iq.id)
        LEFT JOIN submissions AS s ON (s.variant_id = v.id) -- left join in case we have no submissions
    WHERE
        ai.id = $assessment_instance_id
    ORDER BY
        id, date DESC
),
results AS (
    UPDATE assessment_instances AS ai
    SET
        open = FALSE,
        closed_at = CURRENT_TIMESTAMP,
        duration = ai.duration + (la.date - ai.date)
    FROM
        last_activity AS la
    WHERE
        ai.id = $assessment_instance_id
        AND ai.open
    RETURNING ai.*
)
INSERT INTO assessment_state_logs
        (open,  assessment_instance_id, auth_user_id)
(
    SELECT
         false, id,                    $auth_user_id
    FROM
        results
);
