SELECT s.*
FROM course_instances AS ci
JOIN semesters AS s ON (s.id = ci.semester_id)
WHERE ci.id = $1;
