-- BLOCK select_timezones
SELECT
  name,
  utc_offset::interval
FROM
  pg_timezone_names
ORDER BY
  utc_offset,
  name;
