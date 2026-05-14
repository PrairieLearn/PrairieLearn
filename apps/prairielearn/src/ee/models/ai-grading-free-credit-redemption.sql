-- BLOCK select_course_free_credit_redemptions_used
SELECT
  ai_grading_free_credit_redemptions_used
FROM
  courses
WHERE
  id = $course_id;

-- BLOCK select_course_free_credit_redemptions_used_for_no_key_update
SELECT
  ai_grading_free_credit_redemptions_used
FROM
  courses
WHERE
  id = $course_id
  -- AI grading and Stripe credit transactions lock course_instances first, then
  -- take FK KEY SHARE on courses. This still serializes redemptions without
  -- blocking that second lock, preventing a courses -> course_instances /
  -- course_instances -> courses deadlock.
FOR NO KEY UPDATE;

-- BLOCK increment_course_free_credit_redemptions
UPDATE courses
SET
  ai_grading_free_credit_redemptions_used = ai_grading_free_credit_redemptions_used + 1
WHERE
  id = $course_id
RETURNING
  ai_grading_free_credit_redemptions_used;
