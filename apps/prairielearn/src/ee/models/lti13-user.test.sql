-- BLOCK insert_lti13_instance
INSERT INTO
  lti13_instances (institution_id)
VALUES
  (1)
RETURNING
  id;

-- BLOCK delete_lti13_users
DELETE FROM lti13_users;
