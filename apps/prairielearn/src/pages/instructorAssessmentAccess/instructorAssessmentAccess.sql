-- BLOCK assessment_access_rules
SELECT
  to_jsonb(aar) AS assessment_access_rule,
  to_jsonb(pt_c) AS pt_course,
  to_jsonb(pt_x) AS pt_exam
FROM
  assessment_access_rules AS aar
  JOIN assessments AS a ON (a.id = aar.assessment_id)
  LEFT JOIN pt_exams AS pt_x ON (pt_x.uuid = aar.exam_uuid)
  LEFT JOIN pt_courses AS pt_c ON (pt_c.id = pt_x.course_id)
WHERE
  a.id = $assessment_id
ORDER BY
  aar.number ASC;
