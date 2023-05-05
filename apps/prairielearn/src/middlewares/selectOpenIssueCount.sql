-- BLOCK select_open_issue_count
SELECT
  count(*)::int
FROM
  issues AS i
WHERE
  i.course_id = $course_id
  AND i.course_caused
  AND i.open;
