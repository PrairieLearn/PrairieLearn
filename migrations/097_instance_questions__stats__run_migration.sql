CREATE OR REPLACE FUNCTION
    migration_097_array_product(
        IN x DOUBLE PRECISION[],
        IN y DOUBLE PRECISION[],
        OUT product DOUBLE PRECISION[]
    )
AS $$
BEGIN
    SELECT array_agg(xi * yi) INTO product FROM unnest(x, y) as tmp (xi,yi);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

------------------------------------------------------------------------------
------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION
    migration_097_array_increments_above_max(
        IN data double precision[],
        OUT increments double precision[]
    )
AS $$
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

CREATE OR REPLACE FUNCTION
    migration_097_instance_questions_calculate_stats(
        instance_question_id_param bigint
    ) RETURNS VOID
AS $$
DECLARE
    some_submission_var boolean;
    some_perfect_submission_var boolean;
    some_nonzero_submission_var boolean;
    submission_score_array_var double precision[];
    max_submission_score_var double precision;
    average_submission_score_var double precision;
    incremental_submission_score_array_var double precision[];
BEGIN
    SELECT
        count(s.id) > 0,
        coalesce(bool_or(s.score = 1), FALSE),
        coalesce(bool_or(s.score != 0), FALSE),
        array_agg(s.score ORDER BY s.date),
        max(s.score),
        avg(s.score)
    INTO
        some_submission_var,
        some_perfect_submission_var,
        some_nonzero_submission_var,
        submission_score_array_var,
        max_submission_score_var,
        average_submission_score_var
    FROM
        variants AS v
        JOIN submissions AS s ON (s.variant_id = v.id)
    WHERE v.instance_question_id = instance_question_id_param;

    incremental_submission_score_array_var := migration_097_array_increments_above_max(submission_score_array_var);

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
        incremental_submission_points_array = migration_097_array_product(incremental_submission_score_array_var, iq.points_list)
    WHERE iq.id = instance_question_id_param;
END
$$ LANGUAGE plpgsql VOLATILE;

------------------------------------------------------------------------------
------------------------------------------------------------------------------

SELECT migration_097_instance_questions_calculate_stats(iq.id)
FROM instance_questions AS iq;

DROP FUNCTION migration_097_array_product(DOUBLE PRECISION[],DOUBLE PRECISION[]);
DROP FUNCTION migration_097_array_increments_above_max(DOUBLE PRECISION[]);
DROP FUNCTION migration_097_instance_questions_calculate_stats(BIGINT);
