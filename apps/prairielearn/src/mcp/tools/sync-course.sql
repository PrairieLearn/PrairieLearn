-- BLOCK select_sync_problems
(
  SELECT
    'course' AS entity,
    c.short_name AS identifier,
    c.sync_errors AS errors,
    c.sync_warnings AS warnings
  FROM
    courses AS c
  WHERE
    c.id = $course_id
    AND (
      COALESCE(c.sync_errors, '') != ''
      OR COALESCE(c.sync_warnings, '') != ''
    )
)
UNION ALL
(
  SELECT
    'course_instance' AS entity,
    ci.short_name AS identifier,
    ci.sync_errors AS errors,
    ci.sync_warnings AS warnings
  FROM
    course_instances AS ci
  WHERE
    ci.course_id = $course_id
    AND ci.deleted_at IS NULL
    AND (
      COALESCE(ci.sync_errors, '') != ''
      OR COALESCE(ci.sync_warnings, '') != ''
    )
)
UNION ALL
(
  SELECT
    'assessment' AS entity,
    (ci.short_name || '/' || a.tid) AS identifier,
    a.sync_errors AS errors,
    a.sync_warnings AS warnings
  FROM
    assessments AS a
    JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
  WHERE
    ci.course_id = $course_id
    AND a.deleted_at IS NULL
    AND ci.deleted_at IS NULL
    AND (
      COALESCE(a.sync_errors, '') != ''
      OR COALESCE(a.sync_warnings, '') != ''
    )
)
UNION ALL
(
  SELECT
    'question' AS entity,
    q.qid AS identifier,
    q.sync_errors AS errors,
    q.sync_warnings AS warnings
  FROM
    questions AS q
  WHERE
    q.course_id = $course_id
    AND q.deleted_at IS NULL
    AND (
      COALESCE(q.sync_errors, '') != ''
      OR COALESCE(q.sync_warnings, '') != ''
    )
)
ORDER BY
  entity,
  identifier;
