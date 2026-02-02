CREATE FUNCTION
    instance_questions_calculate_stats(
        instance_question_id_param bigint
    ) RETURNS void
AS $$
-- We use a separate CTE for graded_submissions so that first_calculation
-- always returns exactly one row (with NULL/empty aggregates) even when
-- there are no graded submissions.
WITH graded_submissions AS (
    SELECT s.*
    FROM
        variants AS v
        JOIN submissions AS s ON (s.variant_id = v.id)
    WHERE
        v.instance_question_id = instance_question_id_param
        AND s.gradable IS TRUE
        AND s.graded_at IS NOT NULL -- Exclude saved submissions
),
first_calculation AS (
    SELECT
        count(id) > 0 AS some_submission_var,
        coalesce(bool_or(score = 1), FALSE) AS some_perfect_submission_var,
        coalesce(bool_or(score != 0), FALSE) AS some_nonzero_submission_var,
        coalesce(array_agg(score ORDER BY date), '{}'::double precision[]) AS submission_score_array_var,
        coalesce(array_agg(score ORDER BY date) FILTER (WHERE score IS NOT NULL), '{}'::double precision[]) AS submission_non_null_score_array_var,
        max(score) AS max_submission_score_var,
        avg(score) AS average_submission_score_var
    FROM graded_submissions
),
second_calculation AS (
    SELECT coalesce(array_increments_above_max(submission_score_array_var), '{}'::double precision[]) AS incremental_submission_score_array_var
    FROM first_calculation
)
UPDATE instance_questions AS iq
SET
    some_submission = some_submission_var,
    some_perfect_submission = some_perfect_submission_var,
    some_nonzero_submission = some_nonzero_submission_var,
    first_submission_score = submission_non_null_score_array_var[1],
    last_submission_score = submission_non_null_score_array_var[array_length(submission_non_null_score_array_var, 1)],
    max_submission_score = max_submission_score_var,
    average_submission_score = average_submission_score_var,
    submission_score_array = submission_score_array_var,
    incremental_submission_score_array = incremental_submission_score_array_var,
    incremental_submission_points_array = coalesce(scores_to_points_array(incremental_submission_score_array_var, iq.points_list_original), '{}'::double precision[])
FROM
    first_calculation,
    second_calculation
WHERE iq.id = instance_question_id_param;
$$ LANGUAGE SQL VOLATILE;
