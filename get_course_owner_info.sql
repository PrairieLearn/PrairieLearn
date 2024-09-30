WITH
  shared_question_exists AS (
    SELECT
      q.course_id
    FROM
      questions AS q
    WHERE
      q.shared_publicly
    UNION
    SELECT
      q.course_id
    FROM
      sharing_sets AS ss
      JOIN sharing_set_questions AS ssq ON ss.id = ssq.sharing_set_id
      JOIN questions AS q ON q.id = ssq.question_id
  )
SELECT
  c.id AS course_id,
  c.short_name AS course_short_name,
  i.short_name AS institution_short_name,
  u.uid,
  u.email
FROM
  shared_question_exists
  JOIN pl_courses as c on c.id = shared_question_exists.course_id
  JOIN course_permissions AS cp ON cp.course_id = shared_question_exists.course_id
  JOIN users AS u ON u.user_id = cp.user_id
  JOIN institutions AS i on i.id = c.institution_id
WHERE
  cp.course_role = 'Owner';
