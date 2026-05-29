-- BLOCK select_active_lockdown_browser_reservation
-- Find the user's currently-active LDB-required reservation. Used by the
-- End exam handler to look up the reservation_id at click time, so the
-- session no longer has to persist a PT-supplied id across PL's
-- session-regeneration on identity transition.
--
-- "Active" here is the strict in-window definition (access_start <= now
-- <= access_end), which matches what the LDB session is bound to. PT
-- enforces at most one such reservation per user, so a `LIMIT 1` is
-- safe; the helper returns null when none is found.
--
-- The join shape mirrors `exam-mode.sql`: a course-run session carries
-- the LDB flag on `pt_sessions`, a center-managed session carries it on
-- `pt_locations`; COALESCE collapses both cases.
SELECT
  r.id
FROM
  pt_reservations AS r
  JOIN pt_enrollments AS e ON (e.id = r.enrollment_id)
  JOIN pt_sessions AS s ON (s.id = r.session_id)
  LEFT JOIN pt_locations AS l ON (l.id = s.location_id)
WHERE
  e.user_id = $authn_user_id
  AND r.access_start IS NOT NULL
  AND r.access_end IS NOT NULL
  AND $date BETWEEN r.access_start AND r.access_end
  AND COALESCE(
    l.lockdown_browser_enabled,
    s.lockdown_browser_enabled,
    FALSE
  )
ORDER BY
  r.access_end ASC
LIMIT
  1;
