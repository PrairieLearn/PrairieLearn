-- BLOCK insert_institution
INSERT INTO
  institutions (id, short_name, long_name, uid_regexp)
VALUES
  ($id, $short_name, $long_name, $uid_regexp);

-- BLOCK insert_course
INSERT INTO
  courses (id, institution_id, display_timezone, path)
VALUES
  ($id, $institution_id, $display_timezone, $path);

-- BLOCK insert_course_instance
INSERT INTO
  course_instances (
    id,
    uuid,
    course_id,
    display_timezone,
    enrollment_code
  )
VALUES
  ($id, $uuid, $course_id, 'UTC', $enrollment_code);

-- BLOCK insert_user
INSERT INTO
  users (id, uid, institution_id, lti_course_instance_id)
VALUES
  (
    $id,
    $uid,
    $institution_id,
    $lti_course_instance_id
  );

-- BLOCK insert_course_instance_access_rule
INSERT INTO
  course_instance_access_rules (
    course_instance_id,
    number,
    uids,
    start_date,
    end_date,
    institution
  )
VALUES
  (
    $course_instance_id,
    $number,
    $uids::text[],
    $start_date::timestamptz,
    $end_date::timestamptz,
    $institution
  );
