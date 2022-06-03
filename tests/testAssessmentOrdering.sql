-- BLOCK get_test_course
SELECT assessments_group_by, id
FROM course_instances
WHERE short_name = 'Sp15';

-- BLOCK test_course_assessments_group_by_module
UPDATE course_instances
SET assessments_group_by = 'Module'
WHERE short_name = 'Sp15'
RETURNING id;