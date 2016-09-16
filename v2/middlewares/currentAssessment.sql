-- BLOCK assessment
SELECT
    a.*
FROM
    assessments AS a
WHERE
    a.id = $assessment_id
    AND a.deleted_at IS NULL
    AND a.course_instance_id = $course_instance_id;

-- BLOCK assessment_set
SELECT aset.*
FROM assessments as a
JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
WHERE a.id = $assessment_id
AND a.course_instance_id = $course_instance_id;
