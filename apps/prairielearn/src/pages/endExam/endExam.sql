-- BLOCK select_active_lockdown_browser_reservation
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
