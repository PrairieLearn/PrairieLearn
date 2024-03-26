-- BLOCK course_instance_access_rules
SELECT
  CASE
    WHEN ciar.uids IS NULL THEN '—'
    ELSE array_to_string(ciar.uids, ', ')
  END AS uids,
  CASE
    WHEN ciar.start_date IS NULL THEN '—'
    ELSE format_date_full_compact (ciar.start_date, ci.display_timezone)
  END AS start_date,
  CASE
    WHEN ciar.end_date IS NULL THEN '—'
    ELSE format_date_full_compact (ciar.end_date, ci.display_timezone)
  END AS end_date,
  CASE
    WHEN ciar.institution IS NULL THEN '—'
    ELSE ciar.institution::text
  END AS institution
FROM
  course_instance_access_rules AS ciar
  JOIN course_instances AS ci ON (ci.id = ciar.course_instance_id)
WHERE
  ciar.course_instance_id = $course_instance_id
ORDER BY
  ciar.number;
