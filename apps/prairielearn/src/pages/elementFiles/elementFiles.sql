-- BLOCK select_has_shared_question
SELECT
  EXISTS (
    SELECT
      1
    FROM
      questions AS q
    WHERE
      q.shared_publicly
      AND course_id = $producing_course_id
      AND q.deleted_at IS NULL
    UNION
    SELECT
      1
    FROM
      sharing_sets AS ss
      JOIN sharing_set_courses AS ssc ON ss.id = ssc.sharing_set_id
      JOIN sharing_set_questions AS ssq ON ss.id = ssq.sharing_set_id
      JOIN questions AS q on q.id = ssq.question_id
    WHERE
      ss.course_id = $producing_course_id
      AND ssc.course_id = $consuming_course_id
      AND q.deleted_at IS NULL
  );

-- BLOCK select_has_publicly_shared_question
SELECT
  EXISTS (
    SELECT
      1
    FROM
      questions AS q
    WHERE
      q.shared_publicly
      AND course_id = $course_id
      AND q.deleted_at IS NULL
  );
