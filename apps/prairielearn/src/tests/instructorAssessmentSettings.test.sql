-- BLOCK update_course_repo
UPDATE pl_courses
SET
  repository = $repo
WHERE
  id = 1;

-- BLOCK select_assessment_by_id
SELECT
  a.*,
  aset.name AS assessment_set_name,
  am.name AS assessment_module_name
FROM
  assessments AS a
  JOIN assessment_sets AS aset ON a.assessment_set_id = aset.id
  JOIN assessment_modules AS am ON a.assessment_module_id = am.id
WHERE
  a.id = $id;
