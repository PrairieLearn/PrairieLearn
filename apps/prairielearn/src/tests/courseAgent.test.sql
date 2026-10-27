-- BLOCK clear_budget_requests
DELETE FROM course_agent_budget_requests;

-- BLOCK set_review_course
UPDATE courses
SET
  repository = $repository,
  branch = $branch,
  path = $path
WHERE
  id = $course_id;
