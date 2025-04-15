-- BLOCK check_assessment_is_public
SELECT
  a.share_source_publicly
FROM
  assessments AS a
WHERE
  a.id = $assessment_id;

-- BLOCK select_assessment_by_id
SELECT
  *
FROM
  assessments
where
  id = $assessment_id;
