-- With #12583 upgrading to a newer openid-client library, the format of stored
-- access tokens changed. This migration clears any cached copies in the old format.
UPDATE lti13_instances
SET
  access_token_expires_at = NULL,
  access_tokenset = NULL;
