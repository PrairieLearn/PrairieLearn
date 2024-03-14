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

    -- Does the user have an active online CBTF reservation, if so set mode to 'Exam'
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

    -- Does the user have an active PT reservation, or a reservation for a session
    -- that either will start soon or started recently?
    SELECT r.session_id
    INTO v_session_id
    FROM
        pt_reservations AS r
        JOIN pt_enrollments AS e ON (e.id = r.enrollment_id)
        JOIN pt_sessions AS s ON (s.id = r.session_id)
    WHERE
        e.user_id = ip_to_mode.authn_user_id
        AND (
            (r.access_end IS NULL and s.date BETWEEN ip_to_mode.date - '1 hour'::interval and ip_to_mode.date + '1 hour'::interval)
            OR (ip_to_mode.date BETWEEN r.access_start AND r.access_end)
        );

    RAISE NOTICE 'Found % reservations for user %', v_session_id, ip_to_mode.authn_user_id;

    IF FOUND THEN
        RAISE NOTICE 'User has a reservation for session %', v_session_id;

        -- The user has a checked-in pt_reservation. Check whether the
        -- reservation is in a testing center location that requires network
        -- filtering.

        SELECT loc.id, loc.filter_networks
        INTO v_location_id, v_filter_networks
        FROM
            pt_sessions AS s
            JOIN pt_locations AS loc ON (loc.id = s.location_id)
        WHERE
            s.id = v_session_id;

        IF FOUND THEN
            RAISE NOTICE 'Session % is in location %', v_session_id, v_location_id;

            -- The reservation is in a testing center location.
            IF v_filter_networks THEN
                RAISE NOTICE 'Location % requires network filtering', v_location_id;
                -- The reservation is in a testing center location that requires
                -- network filtering.

                PERFORM *
                FROM pt_location_networks AS ln
                WHERE
                    ln.location_id = v_location_id
                    AND ip <<= ln.network;

                IF FOUND THEN
                    RAISE NOTICE 'User is physically inside the testing center';
                    -- The user is physically inside the testing center. Set
                    -- mode to 'Exam'.
                    mode := 'Exam';
                ELSE
                    RAISE NOTICE 'User is physically outside the testing center';
                    -- Although we have a checked-in reservation, the user is
                    -- physically outside the testing center. Set mode to
                    -- 'Public'.
                    mode := 'Public';
                END IF;
            ELSE
                -- The reservation is in a testing center location that doesn't
                -- require network filtering. Set mode to 'Exam'.
                mode := 'Exam';
            END IF;
        ELSE
            -- The reservation isn't for a testing center location (it's a
            -- course-run session), so we set exam mode.
            mode := 'Exam';
        END IF;

    END IF;

END;
$$ LANGUAGE plpgsql VOLATILE;
