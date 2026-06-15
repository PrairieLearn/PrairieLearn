-- BLOCK maybe_update_user_stripe_customer_id
UPDATE users
SET
  stripe_customer_id = $stripe_customer_id
WHERE
  id = $user_id
  AND stripe_customer_id IS NULL;
