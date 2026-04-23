-- BLOCK select_sharing_set_usage
SELECT
  (
    SELECT
      COUNT(*)
    FROM
      sharing_set_questions AS ssq
      JOIN sharing_sets AS ss ON ss.id = ssq.sharing_set_id
    WHERE
      ss.course_id = $course_id
      AND ss.name = $name
  ) AS question_count,
  (
    SELECT
      COUNT(*)
    FROM
      sharing_set_courses AS ssc
      JOIN sharing_sets AS ss ON ss.id = ssc.sharing_set_id
    WHERE
      ss.course_id = $course_id
      AND ss.name = $name
  ) AS consumer_count;

-- BLOCK delete_sharing_set
DELETE FROM sharing_sets
WHERE
  course_id = $course_id
  AND name = $name;
