CREATE OR REPLACE FUNCTION migration_102_array_increments_above_max (
  IN data double precision[],
  OUT increments double precision[]
) AS $$
DECLARE
    i integer;
    max_val double precision := 0;
BEGIN
    FOR i in 1..coalesce(cardinality(data), 0) LOOP
        increments[i] := greatest(0, data[i] - max_val);
        max_val := greatest(max_val, data[i]);
    END LOOP;
END;
$$ LANGUAGE plpgsql VOLATILE;

------------------------------------------------------------------------------
------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION migration_102_array_product (
  IN x DOUBLE PRECISION[],
  IN y DOUBLE PRECISION[],
  OUT product DOUBLE PRECISION[]
) AS $$
BEGIN
    SELECT array_agg(xi * yi) INTO product FROM unnest(x, y) as tmp (xi,yi);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

------------------------------------------------------------------------------
------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION migration_102_instance_questions_calculate_stats (instance_question_id_param bigint) RETURNS VOID AS $$
WITH first_calculation AS (
    SELECT
        count(s.id) > 0                        AS some_submission_var,
        coalesce(bool_or(s.score = 1), FALSE)  AS some_perfect_submission_var,
        coalesce(bool_or(s.score != 0), FALSE) AS some_nonzero_submission_var,
        array_agg(s.score ORDER BY s.date)     AS submission_score_array_var,
        max(s.score)                           AS max_submission_score_var,
        avg(s.score)                           AS average_submission_score_var
    FROM
        variants AS v
        JOIN submissions AS s ON (s.variant_id = v.id)
    WHERE v.instance_question_id = instance_question_id_param
),
second_calculation AS (
    SELECT migration_102_array_increments_above_max(submission_score_array_var) AS incremental_submission_score_array_var
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
    incremental_submission_points_array = migration_102_array_product(incremental_submission_score_array_var, iq.points_list_original)
FROM
    first_calculation,
    second_calculation
WHERE iq.id = instance_question_id_param;
$$ LANGUAGE SQL VOLATILE;

------------------------------------------------------------------------------
------------------------------------------------------------------------------
WITH
  fixed_submissions AS (
    UPDATE submissions AS s
    SET
      score = 0
    WHERE
      score = 'NaN'
    RETURNING
      s.*
  ),
  instance_questions_needing_fixing AS (
    SELECT DISTINCT
      iq.id
    FROM
      fixed_submissions AS s
      JOIN variants AS v ON (v.id = s.variant_id)
      JOIN instance_questions AS iq ON (iq.id = v.instance_question_id)
  )
SELECT
  migration_102_instance_questions_calculate_stats (iq.id)
FROM
  instance_questions_needing_fixing AS iq;

------------------------------------------------------------------------------
------------------------------------------------------------------------------
DROP FUNCTION migration_102_instance_questions_calculate_stats (BIGINT);

DROP FUNCTION migration_102_array_product (DOUBLE PRECISION[], DOUBLE PRECISION[]);

DROP FUNCTION migration_102_array_increments_above_max (double precision[]);
