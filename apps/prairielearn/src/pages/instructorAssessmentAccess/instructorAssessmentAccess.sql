-- BLOCK assessment_access_rules
SELECT
  CASE
    WHEN aar.mode IS NULL THEN '—'
    ELSE aar.mode::text
  END AS mode,
  CASE
    WHEN aar.uids IS NULL THEN '—'
    ELSE array_to_string(aar.uids, ', ')
  END AS uids,
  CASE
    WHEN aar.start_date IS NULL THEN '—'
    ELSE format_date_full_compact (aar.start_date, ci.display_timezone)
  END AS start_date,
  CASE
    WHEN aar.end_date IS NULL THEN '—'
    ELSE format_date_full_compact (aar.end_date, ci.display_timezone)
  END AS end_date,
  CASE
    WHEN aar.credit IS NULL THEN '—'
    ELSE aar.credit::text || '%'
  END AS credit,
  CASE
    WHEN aar.time_limit_min IS NULL THEN '—'
    ELSE aar.time_limit_min::text || ' min'
  END AS time_limit,
  CASE
    WHEN aar.password IS NULL THEN '—'
    ELSE aar.password
  END AS password,
  aar.exam_uuid,
  pt_c.id AS pt_course_id,
  pt_c.name AS pt_course_name,
  pt_x.id AS pt_exam_id,
  pt_x.name AS pt_exam_name,
  CASE
    WHEN aar.active THEN 'True'
    ELSE 'False'
  END AS active
FROM
  assessment_access_rules AS aar
  JOIN assessments AS a ON (a.id = aar.assessment_id)
  JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
  LEFT JOIN pt_exams AS pt_x ON (pt_x.uuid = aar.exam_uuid)
  LEFT JOIN pt_courses AS pt_c ON (pt_c.id = pt_x.course_id)
WHERE
  a.id = $assessment_id
ORDER BY
  aar.number;
