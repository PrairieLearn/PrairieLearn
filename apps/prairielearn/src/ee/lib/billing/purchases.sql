-- BLOCK select_purchases
SELECT
  to_jsonb(scs.*) AS stripe_checkout_session,
  to_jsonb(ci.*) AS course_instance,
  to_jsonb(c.*) AS course
FROM
  stripe_checkout_sessions AS scs
  LEFT JOIN course_instances AS ci ON (ci.id = scs.course_instance_id)
  LEFT JOIN pl_courses AS c ON (c.id = ci.course_id)
WHERE
  agent_user_id = $user_id
ORDER BY
  scs.completed_at DESC,
  scs.created_at DESC;
