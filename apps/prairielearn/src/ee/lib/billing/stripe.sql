-- BLOCK update_user_stripe_customer_id
UPDATE users
SET
  stripe_customer_id = $stripe_customer_id
WHERE
  user_id = $user_id;
