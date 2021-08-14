-- BLOCK get_test_course
SELECT assessments_group_by, id
FROM pl_courses
WHERE short_name = 'QA 101';

-- BLOCK test_course_assessments_group_by_unit
UPDATE pl_courses
SET assessments_group_by = 'Unit'
WHERE short_name = 'QA 101'
RETURNING id;
