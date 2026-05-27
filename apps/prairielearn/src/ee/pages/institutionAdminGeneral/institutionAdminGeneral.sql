-- BLOCK update_institution_course_request_message
UPDATE institutions
SET
  course_request_message = $course_request_message
WHERE
  id = $institution_id
RETURNING
  institutions.*;
