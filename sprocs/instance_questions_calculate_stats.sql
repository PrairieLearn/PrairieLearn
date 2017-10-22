CREATE OR REPLACE FUNCTION
    instance_questions_calculate_stats(
        instance_question_id_param bigint
    ) RETURNS VOID
AS $$
WITH first_calculation AS (
    SELECT
        count(s.id) > 0 AS some_submission_var,
        coalesce(bool_or(s.score = 1), FALSE) AS some_perfect_submission_var,
        coalesce(bool_or(s.score != 0), FALSE) AS some_nonzero_submission_var,
        array_agg(s.score ORDER BY s.date) AS submission_score_array_var,
        max(s.score) AS max_submission_score_var,
        avg(s.score) AS average_submission_score_var
    FROM
        variants AS v
        JOIN submissions AS s ON (s.variant_id = v.id)
    WHERE v.instance_question_id = instance_question_id_param
),
second_calculation AS (
    SELECT array_increments_above_max(submission_score_array_var) AS incremental_submission_score_array_var
    FROM first_calculation
)
UPDATE instance_questions AS iq
SET
    some_submission = some_submission_var,
    some_perfect_submission = some_perfect_submission_var,
    some_nonzero_submission = some_nonzero_submission_var,
    first_submission_score = submission_score_array_var[1],
    last_submission_score = submission_score_array_var[array_length(submission_score_array_var, 1)],
    max_submission_score = max_submission_score_var,
    average_submission_score = average_submission_score_var,
    submission_score_array = submission_score_array_var,
    incremental_submission_score_array = incremental_submission_score_array_var,
    incremental_submission_points_array = array_product(incremental_submission_score_array_var, iq.points_list)
FROM
    first_calculation,
    second_calculation
WHERE iq.id = instance_question_id_param;
$$ LANGUAGE SQL VOLATILE;
