-- BLOCK select_active_prairietest_reservation
WITH
  active_reservations AS (
    SELECT
      r.session_id,
      -- We consider a session to be "active" if either of the following is true:
      (
        -- The reservation is checked in but hasn't had their access start yet.
        -- We'll consider the reservation active for the first hour after check-in.
        r.checked_in IS NOT NULL
        AND r.access_start IS NULL
        AND r.access_end IS NULL
        AND $date BETWEEN r.checked_in AND r.checked_in  + '1 hour'::interval
      )
      OR (
        -- The reservation has had their access start at some point, and the current
        -- time is within the access window.
        r.access_start IS NOT NULL
        AND r.access_end IS NOT NULL
        AND $date BETWEEN r.access_start AND r.access_end
      ) AS reservation_active,
      (
        -- The strict "access is open right now" window, without
        -- `reservation_active`'s post-check-in grace: PT only accepts a
        -- cheating report while access is open, so the control should
        -- appear exactly then.
        r.access_start IS NOT NULL
        AND r.access_end IS NOT NULL
        AND $date BETWEEN r.access_start AND r.access_end
      ) AS reservation_in_access_window,
      r.id AS reservation_id,
      l.id AS location_id,
      l.filter_networks AS location_filter_networks,
      -- For center sessions the location's flag is authoritative; for
      -- course-run sessions it lives on the session itself. COALESCE
      -- collapses both cases — the schema guarantees the relevant column
      -- is non-null in each.
      COALESCE(
        l.lockdown_browser_enabled,
        s.lockdown_browser_enabled,
        FALSE
      ) AS reservation_requires_lockdown_browser,
      -- Whether the session's owner has opted in to student cheating reports.
      -- A center session's owner is the center (through the location); a
      -- course-run session's owner is the course (through the reservation's
      -- exam). PrairieTest re-checks this authoritatively on submit; we read it
      -- here so the control only appears for opted-in exams.
      COALESCE(
        CASE
          WHEN l.id IS NOT NULL THEN ctr.cheating_reports_enabled
          ELSE crs.cheating_reports_enabled
        END,
        FALSE
      ) AS cheating_reports_enabled
    FROM
      pt_reservations AS r
      JOIN pt_enrollments AS e ON (e.id = r.enrollment_id)
      JOIN pt_sessions AS s ON (s.id = r.session_id)
      LEFT JOIN pt_locations AS l ON (l.id = s.location_id)
      LEFT JOIN pt_centers AS ctr ON (ctr.id = l.center_id)
      LEFT JOIN pt_exams AS x ON (x.id = r.exam_id)
      LEFT JOIN pt_courses AS crs ON (crs.id = x.course_id)
    WHERE
      e.user_id = $authn_user_id
      AND (
        -- Handle recently checked-in reservations.
        (
          r.checked_in IS NOT NULL
          AND $date BETWEEN r.checked_in AND r.checked_in  + '1 hour'::interval
        )
        -- Handle reservations that will start soon.
        OR (
          r.access_end IS NULL
          AND $date BETWEEN s.date - '1 hour'::interval AND s.date  + '1 hour'::interval
        )
        -- Handle active and recently-active reservations. The recently-active
        -- piece is really only relevant for center exams with IP filtering, where
        -- we want to ensure that we don't immediately revert to 'Public' mode when
        -- access ends, which would give students a chance to exfiltrate exam
        -- content via Public-mode assessments.
        OR (
          $date BETWEEN r.access_start AND r.access_end  + '30 minutes'::interval
        )
      )
  )
SELECT
  COALESCE(
    BOOL_OR(
      CASE
        WHEN reservation.location_id IS NULL
        OR NOT reservation.location_filter_networks THEN
        -- Either the reservation is for a course-run session, or the
        -- center location doesn't require network filtering. If the
        -- reservation is "active", we're in 'Exam' mode, and we return
        -- immediately. Otherwise, we might be in 'Public' mode, but we
        -- continue looping to see if we have any other reservations that
        -- might put us in 'Exam' mode.
        reservation.reservation_active
        ELSE EXISTS (
          -- If the user is physically inside the testing center, set
          -- mode to 'Exam'.
          SELECT
            1
          FROM
            pt_location_networks AS ln
          WHERE
            ln.location_id = reservation.location_id
            AND $ip <<= ln.network -- noqa: PRS
        )
      END
    ),
    FALSE
  ) AS exam_mode,
  -- If any in-progress reservation requires LockDown Browser, we'll deny
  -- access from non-LDB sessions. We use `reservation_active` (the strict
  -- "right now" window) rather than the broader pre-check-in / post-grace
  -- window so we don't lock students out before the exam actually starts.
  COALESCE(
    BOOL_OR(
      reservation.reservation_active
      AND reservation.reservation_requires_lockdown_browser
    ),
    FALSE
  ) AS requires_lockdown_browser,
  -- An in-access-window reservation whose owning center/course has opted in to
  -- cheating reports, if any; its presence decides whether the navbar shows the
  -- "Report cheating" control. PrairieTest re-checks the opt-in authoritatively
  -- when a report is submitted.
  MIN(reservation.reservation_id) FILTER (
    WHERE
      reservation.reservation_in_access_window
      AND reservation.cheating_reports_enabled
  ) AS cheating_report_reservation_id
FROM
  active_reservations AS reservation;
