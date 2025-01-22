-- BLOCK unknown_set_exists
SELECT
  (
    EXISTS (
      SELECT
        1
      FROM
        assessment_sets
      WHERE
        name = 'Unknown'
        AND course_id = $course_id
    )
  );

-- BLOCK create_unknown_set
INSERT INTO
  assessment_sets (
    name,
    abbreviation,
    heading,
    color,
    number,
    course_id
  )
VALUES
  (
    'Unknown',
    'U',
    'Unknown',
    'red3',
    (
      SELECT
        COALESCE(MAX(number), 0) + 1
      FROM
        assessment_sets
    ),
    $course_id
  );
