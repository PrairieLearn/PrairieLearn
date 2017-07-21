CREATE OR REPLACE FUNCTION
    testing_boundaries_by_date(
        IN givendate date,
        OUT starting timestamptz,
        OUT ending timestamptz
    )
AS $$

BEGIN

    SELECT min(start_time) - interval '10 minutes', max(start_time) + interval '1 hour 10 minutes' 
    INTO starting, ending
    FROM exam_times
    WHERE date(start_time AT TIME ZONE 'US/Central') = givendate;

END;
$$ LANGUAGE plpgsql;
