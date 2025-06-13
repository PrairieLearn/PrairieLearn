-- BLOCK get_test_question
SELECT
  q.id AS question_id
FROM
  questions AS q
WHERE
  q.qid = 'workspace';

-- BLOCK give_owner_access_to_uid
INSERT INTO
  course_permissions (user_id, course_id, course_role) (
    SELECT
      u.user_id,
      1,
      'Owner'
    FROM
      users AS u
    WHERE
      u.uid = $uid
  );

-- BLOCK revoke_owner_access
DELETE FROM course_permissions
WHERE
  course_id = 1;
