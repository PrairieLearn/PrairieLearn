-- BLOCK user_accept_terms
UPDATE users
SET
  terms_accepted_at = NOW()
WHERE
  user_id = $user_id;
