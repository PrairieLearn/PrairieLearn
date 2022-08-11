CREATE FUNCTION
    ip_to_mode(
        IN ip inet,
        IN date timestamptz,
        IN authn_user_id bigint,
        OUT mode enum_mode
    )
AS $$
DECLARE
    v_session_id bigint;
    v_location_id bigint;
    v_filter_networks boolean;
BEGIN
    PERFORM *
    FROM exam_mode_networks
    WHERE ip <<= network AND date <@ during;

    IF FOUND THEN
        mode := 'Exam';
    ELSE
        mode := 'Public';
    END IF;

    -- Do we have an active online CBTF reservation, if so set mode to 'Exam'
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

    -- Do we have an active PT reservation?
    SELECT r.session_id
    INTO v_session_id
    FROM
        pt_reservations AS r
        JOIN pt_enrollments AS e ON (e.id = r.enrollment_id)
    WHERE
        e.user_id = ip_to_mode.authn_user_id
        AND (date BETWEEN r.access_start AND r.access_end);

    IF FOUND THEN
        -- We have a checked-in pt_reservation. Check whether we are in a
        -- testing center location that requires network filtering.

        SELECT loc.id, loc.filter_networks
        INTO v_location_id, v_filter_networks
        FROM
            pt_sessions AS s
            JOIN pt_locations AS loc ON (loc.id = s.location_id)
        WHERE
            s.id = v_session_id;

        IF FOUND THEN
            -- We're in a testing center location.
            IF v_filter_networks THEN
                -- We're in a testing center location that requires network
                -- filtering.

                PERFORM *
                FROM pt_location_networks AS ln
                WHERE
                    ln.location_id = v_location_id
                    AND ip <<= ln.network;

                IF FOUND THEN
                    -- We are inside the testing center. Set mode to 'Exam'.
                    mode := 'Exam';
                ELSE
                    -- Although we have a checked-in reservation, we are
                    -- actually outside the testing center. Set mode to
                    -- 'Public'.
                    mode := 'Public';
                END IF;
            ELSE
                -- We're in a testing center location that doesn't require
                -- network filtering. Set mode to 'Exam'.
                mode := 'Exam';
            END IF;
        ELSE
            -- We aren't in a testing center location, so we set exam mode.
            mode := 'Exam';
        END IF;

    END IF;

END;
$$ LANGUAGE plpgsql VOLATILE;
