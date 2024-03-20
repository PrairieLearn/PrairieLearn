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
    -- Is the user accessing via an exam mode network?
    PERFORM *
    FROM exam_mode_networks
    WHERE ip <<= network AND date <@ during;

    IF FOUND THEN
        mode := 'Exam';
    ELSE
        mode := 'Public';
    END IF;

    -- Does the user have an active PT reservation?
    SELECT r.session_id
    INTO v_session_id
    FROM
        pt_reservations AS r
        JOIN pt_enrollments AS e ON (e.id = r.enrollment_id)
    WHERE
        e.user_id = ip_to_mode.authn_user_id
        AND (date BETWEEN r.access_start AND r.access_end);

    IF FOUND THEN
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
            -- The reservation is in a testing center location.
            IF v_filter_networks THEN
                -- The reservation is in a testing center location that requires
                -- network filtering.

                PERFORM *
                FROM pt_location_networks AS ln
                WHERE
                    ln.location_id = v_location_id
                    AND ip <<= ln.network;

                IF FOUND THEN
                    -- The user is physically inside the testing center. Set
                    -- mode to 'Exam'.
                    mode := 'Exam';
                ELSE
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
