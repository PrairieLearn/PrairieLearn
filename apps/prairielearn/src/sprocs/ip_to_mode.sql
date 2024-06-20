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
    -- Is the user accessing via an exam mode network?
    PERFORM *
    FROM exam_mode_networks
    WHERE ip <<= network AND date <@ during;

    IF FOUND THEN
        mode := 'Exam';
    ELSE
        mode := 'Public';
    END IF;

    -- Consider each PT reservation which is either active or corresponds to
    -- a session that will start soon or started recently.
    FOR reservation IN
        SELECT
            r.session_id,
            (
                (r.checked_in IS NOT NULL AND ip_to_mode.date BETWEEN r.checked_in AND r.checked_in + '1 hour'::interval)
                OR ip_to_mode.date BETWEEN r.access_start AND r.access_end
            ) AS reservation_active,
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
                -- Handle recently checked-in reservations.
                (r.checked_in IS NOT NULL and ip_to_mode.date BETWEEN r.checked_in AND r.checked_in + '1 hour'::interval)
                -- Handle reservations that will start soon.
                OR (r.access_end IS NULL and ip_to_mode.date BETWEEN s.date - '1 hour'::interval and s.date + '1 hour'::interval)
                -- Handle active and recently-active reservations. The recently-active
                -- piece is really only relevant for center exams with IP filtering, where
                -- we want to ensure that we don't immediately revert to 'Public' mode when
                -- access ends, which would give students a chance to exfiltrate exam
                -- content via Public-mode assessments.
                OR (ip_to_mode.date BETWEEN r.access_start AND r.access_end + '30 minutes'::interval)
            )
    LOOP
        IF reservation.location_id IS NULL OR NOT reservation.location_filter_networks THEN
            -- Either the reservation is for a course-run session, or the
            -- center location doesn't require network filtering. If the
            -- reservation is "active", we're in 'Exam' mode, and we return
            -- immediately. Otherwise, we might be in 'Public' mode, but we
            -- continue looping to see if we have any other reservations that
            -- might put us in 'Exam' mode.
            IF reservation.reservation_active THEN
                mode := 'Exam';
                RETURN;
            END IF;

            mode := 'Public';
            CONTINUE;
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
            CONTINUE;
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql VOLATILE;
