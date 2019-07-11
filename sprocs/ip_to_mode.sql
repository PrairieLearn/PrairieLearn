CREATE OR REPLACE FUNCTION
    ip_to_mode(
        IN ip inet,
        IN date timestamptz,
        OUT mode enum_mode
    )
AS $$
BEGIN
    PERFORM *
    FROM exam_mode_networks
    WHERE ip <<= network AND date <@ during;

    IF FOUND THEN
        mode := 'Exam';
    ELSE
        mode := 'Public';
    END IF;
END;
$$ LANGUAGE plpgsql VOLATILE;
