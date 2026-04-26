-- BLOCK select_course_free_credit_redemptions_used
SELECT
  ai_grading_free_credit_redemptions_used
FROM
  courses
WHERE
  id = $course_id;

-- BLOCK select_course_free_credit_redemptions_used_for_update
SELECT
  ai_grading_free_credit_redemptions_used
FROM
  courses
WHERE
  id = $course_id
FOR UPDATE;

-- BLOCK increment_course_free_credit_redemptions
UPDATE courses
SET
  ai_grading_free_credit_redemptions_used = ai_grading_free_credit_redemptions_used + 1
WHERE
  id = $course_id
RETURNING
  ai_grading_free_credit_redemptions_used;
