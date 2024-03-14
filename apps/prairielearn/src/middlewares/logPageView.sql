-- BLOCK log_page_view
WITH
  log_result AS (
    INSERT INTO
      page_view_logs (
        user_id,
        authn_user_id,
        course_instance_id,
        assessment_id,
        assessment_instance_id,
        question_id,
        variant_id,
        page_type,
        path,
        client_fingerprint_id
      )
    VALUES
      (
        $user_id,
        $authn_user_id,
        $course_instance_id,
        $assessment_id,
        $assessment_instance_id,
        $question_id,
        $variant_id,
        $page_type,
        $path,
        $client_fingerprint_id
      )
    RETURNING
      id
  ),
  current_page_result AS (
    INSERT INTO
      current_pages (
        user_id,
        authn_user_id,
        course_instance_id,
        assessment_id,
        assessment_instance_id,
        question_id,
        variant_id,
        page_type,
        path
      )
    VALUES
      (
        $user_id,
        $authn_user_id,
        $course_instance_id,
        $assessment_id,
        $assessment_instance_id,
        $question_id,
        $variant_id,
        $page_type,
        $path
      )
    ON CONFLICT (user_id) DO
    UPDATE
    SET
      date = now(),
      user_id = EXCLUDED.user_id,
      authn_user_id = EXCLUDED.authn_user_id,
      course_instance_id = EXCLUDED.course_instance_id,
      assessment_id = EXCLUDED.assessment_id,
      assessment_instance_id = EXCLUDED.assessment_instance_id,
      question_id = EXCLUDED.question_id,
      variant_id = EXCLUDED.variant_id,
      page_type = EXCLUDED.page_type,
      path = EXCLUDED.path
  )
SELECT
  id
FROM
  log_result;
