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
    AND v.open -- ensure the variant is still open
FOR UPDATE OF ai;

-- BLOCK lock_with_grading_job_id
SELECT
    gj.auth_user_id,
    ((gj.graded_at IS NOT NULL) OR (gj.grading_request_canceled_at IS NOT NULL)) AS grading_not_needed,
    iq.id AS instance_question_id,
    ai.id AS assessment_instance_id,
    s.credit
FROM
    grading_jobs AS gj
    JOIN submissions AS s ON (s.id = gj.submission_id)
    JOIN variants AS v ON (v.id = s.variant_id)
    JOIN instance_questions AS iq ON (iq.id = v.instance_question_id)
    JOIN assessment_instances AS ai ON (ai.id = iq.assessment_instance_id)
WHERE
    gj.id = $grading_job_id
FOR UPDATE OF ai;

-- BLOCK lock_with_assessment_instance_id
SELECT
    ai.id
FROM
    assessment_instances AS ai
WHERE
    ai.id = $assessment_instance_id
    AND ai.open
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
    JOIN pl_courses AS c ON (c.id = ci.course_id)
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
INSERT INTO grading_jobs
        (submission_id, score, correct, feedback,  auth_user_id)
(
    SELECT
         id,            score, correct, feedback, $auth_user_id
    FROM
        results
);

-- BLOCK update_grading_job_and_submission
WITH
updated_grading_job AS (
    UPDATE grading_jobs AS gj
    SET
        graded_at = CURRENT_TIMESTAMP,
        grading_started_at = $grading_started_at,
        grading_finished_at = $grading_finished_at,
        score = $score,
        correct = $correct,
        feedback = $feedback
    WHERE
        gj.id = $grading_job_id
        AND gj.graded_at IS NULL
        AND gj.grading_request_canceled_at IS NULL
    RETURNING
        gj.*
)
UPDATE submissions AS s
SET
    graded_at = gj.graded_at,
    score = gj.score,
    correct = gj.correct,
    feedback = gj.feedback
FROM
    updated_grading_job AS gj
WHERE
    s.id = gj.submission_id;

-- BLOCK update_instance_question_in_grading
UPDATE instance_questions AS iq
SET
    points_in_grading = iq.current_value,
    score_perc_in_grading = floor(iq.current_value / iq.points_list[1] * 100)
WHERE
    iq.id = $instance_question_id;

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
