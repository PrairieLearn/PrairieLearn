SELECT
  COUNT(DISTINCT q.id) FILTER (WHERE q.share_publicly) AS num_share_publicly,
  COUNT(DISTINCT q.id) FILTER (WHERE ssq.id IS NOT NULL) AS num_shared_in_sets,
  COUNT(DISTINCT q.id) FILTER (WHERE q.share_publicly OR ssq.id IS NOT NULL) AS num_shared_total,
  COUNT(DISTINCT q.course_id) FILTER (WHERE q.share_publicly OR ssq.id IS NOT NULL) AS num_courses_sharing
FROM
  questions q
LEFT JOIN sharing_set_questions ssq
  ON ssq.question_id = q.id
WHERE
  q.deleted_at IS NULL;