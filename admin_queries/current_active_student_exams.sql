WITH
  possible_exams AS (
    SELECT
      ai.id
    FROM
      assessment_instances AS ai
      JOIN assessments AS a ON (a.id = ai.assessment_id)
    WHERE
      ai.date > now() - interval '1 day'
      AND ai.open
      AND a.type = 'Exam'
  ),
  last_views AS (
    SELECT DISTINCT
      ON (ai.id) ai.id,
      pvl.date
    FROM
      possible_exams AS ai
      JOIN page_view_logs AS pvl ON (pvl.assessment_instance_id = ai.id)
    ORDER BY
      ai.id,
      pvl.date DESC
  ),
  last_submissions AS (
    SELECT DISTINCT
      ON (ai.id) ai.id,
      s.date
    FROM
      possible_exams AS ai
      JOIN instance_questions AS iq ON (iq.assessment_instance_id = ai.id)
      JOIN variants AS v ON (v.instance_question_id = iq.id)
      JOIN submissions AS s ON (s.variant_id = v.id)
    WHERE
      s.credit > 0
    ORDER BY
      ai.id,
      s.date DESC
  )
SELECT
  ai.id AS assessment_instance_id,
  format_date_full_compact (ai.date, 'UTC') AS start_date,
  format_interval (now() - last_views.date) AS since_last_view,
  DATE_PART('epoch', (now() - last_views.date)) AS _sortval_since_last_view,
  format_interval (now() - last_submissions.date) AS since_last_submission,
  DATE_PART('epoch', (now() - last_submissions.date)) AS _sortval_since_last_submission,
  ci.short_name AS instance,
  c.short_name AS course,
  aset.name AS assessment_set,
  a.number AS assessment_number,
  a.title,
  u.uid
FROM
  possible_exams
  JOIN assessment_instances AS ai ON (ai.id = possible_exams.id)
  LEFT JOIN last_views ON (last_views.id = ai.id)
  LEFT JOIN last_submissions ON (last_submissions.id = ai.id)
  JOIN assessments AS a ON (a.id = ai.assessment_id)
  JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
  JOIN users AS u ON (u.user_id = ai.user_id)
  JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
  JOIN pl_courses AS c ON (c.id = ci.course_id)
WHERE
  (
    (
      (last_submissions.date IS NULL)
      AND (ai.date > now() - interval '1 hour')
    )
    OR (last_submissions.date > now() - interval '1 hour')
  )
  AND aset.name != 'Practice Exam'
ORDER BY
  ai.date,
  ai.id;
