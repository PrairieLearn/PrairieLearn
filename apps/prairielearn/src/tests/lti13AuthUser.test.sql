-- BLOCK configure_default_institution
UPDATE institutions
SET
  uid_regexp = '@example\.com$'
WHERE
  id = 1;

-- BLOCK configure_invalid_uid_regexp
UPDATE institutions
SET
  uid_regexp = '['
WHERE
  id = 1;

-- BLOCK insert_lti13_instance
INSERT INTO
  lti13_instances (institution_id, name)
VALUES
  (1, 'Identity test LMS')
RETURNING
  *;
