-- BLOCK select_issue_count_for_variant
SELECT
  COUNT(*)::int
FROM
  issues AS i
WHERE
  i.variant_id = $variant_id;

-- BLOCK select_issues_for_variant
SELECT
  i.student_message,
  i.instructor_message,
  i.system_data #>> '{courseErrData,outputBoth}' AS output
FROM
  issues AS i
WHERE
  i.variant_id = $variant_id
ORDER BY
  i.id;
