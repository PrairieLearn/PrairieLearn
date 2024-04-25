WITH
  access_rules_with_near_date AS (
    SELECT
      a.id AS assessment_id,
      aar.start_date,
      aar.end_date,
      aar.time_limit_min,
      coalesce(
        array_length(aar.uids, 1),
        (
          SELECT
            count(*)
          FROM
            enrollments AS e
          WHERE
            e.course_instance_id = a.course_instance_id
            AND NOT users_is_instructor_in_course_instance (e.user_id, e.course_instance_id)
        )
      ) AS student_count
    FROM
      assessment_access_rules AS aar
      JOIN assessments AS a ON (a.id = aar.assessment_id)
    WHERE
      (
        aar.start_date BETWEEN (now() - interval '14 days') AND (now() + interval '14 days')
      )
      AND (
        aar.end_date BETWEEN (now() - interval '1 hour') AND (now() + interval '14 days')
      )
      AND aar.credit >= 100
      AND a.type = 'Exam'
      AND a.deleted_at IS NULL
    ORDER BY
      a.id,
      aar.start_date
  )
SELECT
  i.short_name AS institution,
  c.short_name AS course,
  c.id AS course_id,
  ci.short_name AS course_instance,
  ci.id AS course_instance_id,
  aset.abbreviation || a.number || ': ' || a.title AS assessment,
  a.id AS assessment_id,
  format_date_full_compact (arwnd.start_date, 'UTC') AS start_date,
  format_date_full_compact (arwnd.end_date, 'UTC') AS end_date,
  format_interval (arwnd.end_date - arwnd.start_date) AS end_minus_start,
  DATE_PART('epoch', (arwnd.end_date - arwnd.start_date)) AS _sortval_end_minus_start,
  format_interval (make_interval(mins => arwnd.time_limit_min)) AS time_limit,
  arwnd.time_limit_min AS _sortval_time_limit,
  arwnd.student_count,
  EXISTS (
    SELECT
      1
    FROM
      assessment_questions AS aq
      JOIN questions q ON (q.id = aq.question_id)
    WHERE
      aq.assessment_id = a.id
      AND aq.deleted_at IS NULL
  ) AS external_grading
FROM
  access_rules_with_near_date AS arwnd
  JOIN assessments AS a ON (a.id = arwnd.assessment_id)
  JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
  JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
  JOIN pl_courses AS c ON (c.id = ci.course_id)
  JOIN institutions AS i ON (i.id = c.institution_id)
WHERE
  arwnd.student_count >= 20
ORDER BY
  arwnd.start_date,
  i.short_name,
  c.short_name,
  ci.short_name,
  assessment,
  a.id
LIMIT
  100;
