-- BLOCK invalid_secret
INSERT INTO
  lti_credentials (course_instance_id, consumer_key, secret)
VALUES
  (1, 'oauth_key', 'sFDpR@RzLdDW');

-- BLOCK lti_link
UPDATE lti_links
SET
  assessment_id = 9
WHERE
  lti_links.id = 1;
