-- BLOCK select_exam
SELECT
  a.id
FROM
  assessments AS a
  JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
WHERE
  a.course_instance_id = 1
  AND aset.abbreviation = 'HW'
  AND a.number = '7';

-- BLOCK read_assessment_instance_points
SELECT
  ai.points,
  ai.score_perc
FROM
  assessment_instances AS ai
WHERE
  ai.assessment_id = $assessment_id;
