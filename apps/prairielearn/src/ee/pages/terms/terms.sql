-- BLOCK user_accept_terms
UPDATE users
SET
  terms_accepted_at = NOW()
WHERE
  id = $user_id;
