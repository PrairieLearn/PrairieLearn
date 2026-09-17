UPDATE lti13_instances
SET
  client_params = client_params || '{"request_object_signing_alg": "RS256"}';
