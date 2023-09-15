-- BLOCK get_assessment
SELECT
  a.*
FROM
  assessments AS a
  JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
WHERE
  a.course_instance_id = 1
  AND aset.abbreviation = 'HW'
  AND a.number = '9';

-- BLOCK get_instance_question
SELECT
  *
FROM
  instance_questions
WHERE
  id = $iqId;
