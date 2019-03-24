CREATE OR REPLACE FUNCTION get_generated_aq_ids_multiple_reps(
    assessment_id_var BIGINT,
    num_reps INTEGER
) RETURNS SETOF BIGINT[]
AS $$
BEGIN
    FOR counter in 1..num_reps LOOP
        RAISE NOTICE '% %% done', (100*counter/num_reps);
        RETURN QUERY SELECT get_generated_aq_ids(assessment_id_var);
    END LOOP;
END;
$$ LANGUAGE plpgsql VOLATILE;
