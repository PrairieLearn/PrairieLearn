CREATE FUNCTION
    ip_to_mode(
        IN ip inet,
        IN date timestamptz,
        IN authn_user_id bigint,
        OUT mode enum_mode
    )
AS $$
DECLARE
    reservation RECORD;
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

    -- Consider each PT reservation which is either active or corresponds to
    -- a session that will start soon or started recently.
    --
    -- For each reservation, we'll determine 
    FOR reservation IN
        SELECT
            r.session_id,
            (ip_to_mode.date BETWEEN r.access_start AND access_end) AS reservation_active,
            l.id AS location_id,
            l.filter_networks AS location_filter_networks
        FROM
            pt_reservations AS r
            JOIN pt_enrollments AS e ON (e.id = r.enrollment_id)
            JOIN pt_sessions AS s ON (s.id = r.session_id)
            LEFT JOIN pt_locations AS l ON (l.id = s.location_id)
        WHERE
            e.user_id = ip_to_mode.authn_user_id
            AND (
                (r.access_end IS NULL and s.date BETWEEN ip_to_mode.date - '1 hour'::interval and ip_to_mode.date + '1 hour'::interval)
                OR (ip_to_mode.date BETWEEN r.access_start AND r.access_end)
            )
    LOOP
        IF reservation.location_id IS NULL THEN
            -- The reservation isn't for a testing center location (it's a
            -- course-run session). If the reservation is "active", we're
            -- in 'Exam' mode, and we return immediately. Otherwise, we might
            -- be in 'Public' mode, but we continue looping to see if we have
            -- any other reservations that might put us in 'Exam' mode.
            IF reservation.reservation_active THEN
                mode := 'Exam';
                RETURN;
            END IF;

            mode := 'Public';
            CONTINUE;
        END IF;

        IF NOT reservation.location_filter_networks THEN
            -- The reservation is in a testing center location that doesn't
            -- require network filtering. Set mode to 'Exam'.
            mode := 'Exam';
            RETURN;
        END IF;

        PERFORM *
        FROM pt_location_networks AS ln
        WHERE
            ln.location_id = reservation.location_id
            AND ip <<= ln.network;

        IF FOUND THEN
            -- The user is physically inside the testing center. Set
            -- mode to 'Exam'.
            mode := 'Exam';
            RETURN;
        ELSE
            -- Although we have a checked-in reservation, the user is
            -- physically outside the testing center. Set mode to
            -- 'Public', but continue looping to see if we have any other
            -- reservations that might put us in 'Exam' mode.
            mode := 'Public';
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql VOLATILE;
