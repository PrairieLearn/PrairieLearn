-- BLOCK insert_course_agent_action
INSERT INTO
  course_agent_actions (
    course_agent_conversation_id,
    agent_action_id,
    action,
    input,
    card
  )
VALUES
  (
    $course_agent_conversation_id,
    $agent_action_id,
    $action,
    $input,
    $card
  );

-- BLOCK select_course_agent_action
SELECT
  *
FROM
  course_agent_actions
WHERE
  course_agent_conversation_id = $course_agent_conversation_id
  AND agent_action_id = $agent_action_id;
