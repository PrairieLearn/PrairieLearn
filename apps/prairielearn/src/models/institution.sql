-- BLOCK select_institution_for_course
SELECT
  i.*
FROM
  institutions AS i
  JOIN courses AS c ON (c.institution_id = i.id)
WHERE
  c.id = $course_id;

-- BLOCK select_institution_for_course_instance
SELECT
  i.*
FROM
  institutions AS i
  JOIN courses AS c ON (c.institution_id = i.id)
  JOIN course_instances AS ci ON (ci.course_id = c.id)
WHERE
  ci.id = $course_instance_id;

-- BLOCK select_all_institutions
SELECT
  i.*
FROM
  institutions AS i
ORDER BY
  i.short_name,
  i.long_name,
  i.id;

-- BLOCK insert_institution
INSERT INTO
  institutions (
    long_name,
    short_name,
    display_timezone,
    uid_regexp
  )
VALUES
  (
    $long_name,
    $short_name,
    $display_timezone,
    $uid_regexp
  )
RETURNING
  id;
