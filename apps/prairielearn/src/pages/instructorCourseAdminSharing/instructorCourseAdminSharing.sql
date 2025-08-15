-- BLOCK select_sharing_sets
SELECT
  ss.name,
  ss.id,
  COALESCE(
    jsonb_agg(
      c.short_name
      ORDER BY
        c.short_name
    ) FILTER (
      WHERE
        c.short_name IS NOT NULL
    ),
    '[]'
  ) AS shared_with
FROM
  sharing_sets AS ss
  LEFT JOIN sharing_set_courses AS css on css.sharing_set_id = ss.id
  LEFT JOIN pl_courses AS c on c.id = css.course_id
WHERE
  ss.course_id = $course_id
GROUP BY
  ss.id
ORDER BY
  ss.name;

-- BLOCK update_sharing_token
UPDATE pl_courses
SET
  sharing_token = gen_random_uuid()
WHERE
  id = $course_id;

-- BLOCK course_sharing_set_add
INSERT INTO
  sharing_set_courses (course_id, sharing_set_id)
SELECT
  consuming_course.id,
  ss.id
FROM
  pl_courses AS sharing_course
  JOIN sharing_sets AS ss ON ss.course_id = sharing_course.id
  JOIN pl_courses AS consuming_course ON consuming_course.id <> sharing_course.id
WHERE
  consuming_course.sharing_token = $unsafe_course_sharing_token
  AND ss.id = $unsafe_sharing_set_id
  AND sharing_course.id = $sharing_course_id
RETURNING
  course_id;

-- BLOCK select_shared_question_exists
SELECT
  EXISTS (
    SELECT
      1
    FROM
      questions AS q
    WHERE
      q.share_publicly
      AND course_id = $course_id
    UNION
    SELECT
      1
    FROM
      sharing_sets AS ss
      JOIN sharing_set_questions AS ssq ON ss.id = ssq.sharing_set_id
      JOIN questions AS q ON q.id = ssq.question_id
    WHERE
      ss.course_id = $course_id
  );
