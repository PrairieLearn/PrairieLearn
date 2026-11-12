-- BLOCK clear_authors
UPDATE questions
SET
  authors = '{}';

-- BLOCK insert_course
INSERT INTO
  courses (short_name, title, path, display_timezone)
VALUES
  ($name, $name, '/copy-report/' || $name, 'UTC')
RETURNING
  id;

-- BLOCK insert_question
INSERT INTO
  questions (
    course_id,
    qid,
    title,
    uuid,
    authors,
    copied_from_question_id,
    copied_from,
    deleted_at
  )
VALUES
  (
    $course_id,
    $qid,
    'Report question ' || $qid,
    gen_random_uuid(),
    $authors::text[],
    $source_id::bigint,
    coalesce(
      $declared_source::text,
      (
        SELECT
          c.uuid::text || '/' || q.uuid::text
        FROM
          questions AS q
          JOIN courses AS c ON c.id = q.course_id
        WHERE
          q.id = $source_id::bigint
      )
    ),
    CASE
      WHEN $deleted::boolean THEN now()
      ELSE NULL
    END
  )
RETURNING
  id;

-- BLOCK update_source
UPDATE questions
SET
  copied_from_question_id = $source_id,
  copied_from = (
    SELECT
      c.uuid::text || '/' || q.uuid::text
    FROM
      questions AS q
      JOIN courses AS c ON c.id = q.course_id
    WHERE
      q.id = $source_id
  )
WHERE
  id = $question_id;

-- BLOCK delete_course
UPDATE courses
SET
  deleted_at = now()
WHERE
  id = $course_id;
