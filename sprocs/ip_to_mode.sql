CREATE FUNCTION
    ip_to_mode(
        IN ip inet,
        IN date timestamptz,
        IN authn_user_id bigint,
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

    -- Do we have an active online CBTF reservation, if so force mode to 'Exam'
    PERFORM *
    FROM
        reservations AS r
        JOIN exams AS e USING (exam_id)
    WHERE
        r.user_id = ip_to_mode.authn_user_id
        AND r.delete_date IS NULL
        AND r.checked_in IS NOT NULL
        AND r.access_start IS NOT NULL
        AND date BETWEEN r.access_start AND r.access_end
        AND e.exam_type = 'online';

    IF FOUND THEN
        mode := 'Exam';
    END IF;

    -- Do we have an active PT reservation? If so, force mode to 'Exam'
    PERFORM 1
    FROM
        pt_reservations AS r
        JOIN pt_enrollments AS e ON (e.id = r.enrollment_id)
    WHERE
        e.user_id = ip_to_mode.authn_user_id
        AND (date BETWEEN r.access_start AND r.access_end);

    IF FOUND THEN
        mode := 'Exam';
    END IF;

END;
$$ LANGUAGE plpgsql VOLATILE;
