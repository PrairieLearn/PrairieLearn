-- BLOCK insert_course_request
INSERT INTO
  course_requests (
    short_name,
    title,
    user_id,
    first_name,
    last_name,
    work_email,
    institution,
    github_user,
    referral_source,
    approved_status
  )
VALUES
  (
    $short_name,
    $title,
    $user_id,
    $first_name,
    $last_name,
    $work_email,
    $institution,
    $github_user,
    $referral_source,
    'pending'
  )
RETURNING
  course_requests.id as course_request_id;
