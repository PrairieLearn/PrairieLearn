-- BLOCK select_work_list
SELECT
    to_jsonb(iq) AS instance_question,
    to_jsonb(q) AS question,
    to_jsonb(v) AS variant,
    to_jsonb(s) AS submission,
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
    AND s.score IS NULL;

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
        score_perc = floor((CASE WHEN $correct THEN iq.current_value ELSE 0 END) / iq.points_list[1] * 100),
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

-- BLOCK update_assessment_instance
WITH results AS (
    UPDATE assessment_instances AS ai
    SET
        points = new_values.points,
        score_perc = new_values.score_perc
    FROM
        assessment_points_exam($assessment_instance_id, $credit) AS new_values
    WHERE
        ai.id = $assessment_instance_id
    RETURNING ai.*
)
INSERT INTO assessment_score_logs
        (points, max_points, score_perc, assessment_instance_id, auth_user_id)
(
    SELECT
         points, max_points, score_perc, id,                    $auth_user_id
    FROM
        results
);

-- BLOCK close_assessment_instance
WITH
last_activity AS (
    SELECT DISTINCT ON (id)
        ai.id,
        coalesce(s.date, ai.opened_at) AS date
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
