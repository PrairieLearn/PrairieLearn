-- BLOCK update_grading_log_and_submission
WITH
updated_grading_log AS (
    UPDATE grading_logs AS gl
    SET
        date = CURRENT_TIMESTAMP,
        score = $score,
        correct = $correct,
        feedback = $feedback
    WHERE
        gl.id = $grading_log_id
    RETURNING
        gl.*
),
updated_submission AS (
    UPDATE submissions AS s
    SET
        graded_at = gl.date,
        score = gl.score,
        correct = gl.correct,
        feedback = gl.feedback
    FROM
        updated_grading_log AS gl
    WHERE
        s.id = gl.submission_id
    RETURNING
        s.*
)
SELECT
    to_jsonb(gl) AS updated_grading_log,
    iq.id AS instance_question_id
FROM
    updated_grading_log AS gl,
    updated_submission AS s,
    variants AS v
    JOIN instance_questions AS iq ON (iq.id = v.instance_question_id)
WHERE
    v.id = s.variant_id;






        function(callback) {
            var points = res.locals.instance_question.points;
            var current_value = res.locals.instance_question.current_value;
            var number_attempts = res.locals.instance_question.number_attempts;
            if (res.locals.submission.correct) {
                points = Math.min(points + current_value, res.locals.assessment_question.max_points);
                current_value = Math.min(current_value + res.locals.assessment_question.init_points, res.locals.assessment_question.max_points);
            } else {
                current_value = res.locals.assessment_question.init_points;
            }

            var params = {
                instance_question_id: res.locals.instance_question.id,
                points: points,
                current_value: current_value,
                number_attempts: number_attempts + 1,
            };
            sqldb.queryOneRow(sql.update_instance_question, params, function(err, result) {
                if (ERR(err, callback)) return;
                _.assign(res.locals.instance_question, result.rows[0]);
                callback(null);
            });
        },







-- BLOCK update_instance_question
WITH results AS (
    UPDATE instance_questions AS iq
    SET
        points = CASE WHEN $correct THEN iq.points + iq.current_value ELSE 0 END,
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

-- BLOCK update_assessment_instance_score
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
