-- BLOCK select_imported_assessments
SELECT DISTINCT
  a.id,
  a.tid,
  a.title,
  a.type,
  COUNT(DISTINCT q.id)::integer AS question_count
FROM
  assessments AS a
  JOIN assessment_questions AS aq ON (
    aq.assessment_id = a.id
    AND aq.deleted_at IS NULL
  )
  JOIN questions AS q ON (
    q.id = aq.question_id
    AND q.deleted_at IS NULL
  )
WHERE
  a.course_instance_id = $course_instance_id
  AND a.deleted_at IS NULL
  AND q.directory LIKE 'imported/%'
GROUP BY
  a.id,
  a.tid,
  a.title,
  a.type
ORDER BY
  a.id DESC;
