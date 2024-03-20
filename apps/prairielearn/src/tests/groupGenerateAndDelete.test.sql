-- BLOCK generate_500
SELECT
  user_id
FROM
  users_randomly_generate (500, 1)
ORDER BY
  user_id;

-- BLOCK select_group_work_assessment
SELECT
  a.id
FROM
  assessments AS a
  JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
WHERE
  a.course_instance_id = 1
  AND aset.abbreviation = 'HW'
  AND a.group_work is TRUE;

-- BLOCK select_job_sequence
SELECT
  *
FROM
  job_sequences
WHERE
  id = $job_sequence_id;
