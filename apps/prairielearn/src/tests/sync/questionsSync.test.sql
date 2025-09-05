-- BLOCK set_sharing_name
UPDATE 
  pl_courses
SET 
  sharing_name = $sharing_name
WHERE 
  short_name = $course_name