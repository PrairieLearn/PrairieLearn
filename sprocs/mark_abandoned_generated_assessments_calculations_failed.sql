CREATE OR REPLACE FUNCTION
    mark_abandoned_generated_assessments_calculations_failed() RETURNS VOID
AS $$
BEGIN
    UPDATE
        assessments AS a
    SET
        generated_assessments_calculation_status='FAILED'
    WHERE
        a.generated_assessments_calculation_status='STARTED';
END;
$$ LANGUAGE plpgsql VOLATILE;
