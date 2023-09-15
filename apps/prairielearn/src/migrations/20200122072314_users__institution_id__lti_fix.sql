UPDATE users AS u
SET
  institution_id = i.id
FROM
  institutions AS i
WHERE
  i.short_name = 'LTI'
  AND u.lti_course_instance_id IS NOT NULL;
