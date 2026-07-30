-- BLOCK assessment_access_rules
SELECT
  TO_JSONB(aar) AS rule,
  pt_c.id AS pt_course_id,
  pt_c.name AS pt_course_name,
  pt_x.id AS pt_exam_id,
  pt_x.name AS pt_exam_name
FROM
  assessment_access_rules AS aar
  JOIN assessments AS a ON (a.id = aar.assessment_id)
  LEFT JOIN pt_exams AS pt_x ON (pt_x.uuid = aar.exam_uuid)
  LEFT JOIN pt_courses AS pt_c ON (pt_c.id = pt_x.course_id)
WHERE
  a.id = $assessment_id
ORDER BY
  aar.number;
