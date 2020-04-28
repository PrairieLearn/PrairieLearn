-- BLOCK select_groups
SELECT 
  GID,
  groupname,
  COUNT(*) AS num,
  array_to_string(array_agg(uid), ', ') AS uids
FROM (SELECT
        gr.id AS GID,
        gr.group_name AS groupname,
        us.uid AS uid
    FROM
        group_type AS gt
        JOIN groups as gr ON (gt.id = gr.group_type_id)
        JOIN group_user as gu ON (gu.group_id = gr.id)
        JOIN users as us ON (us.user_id = gu.user_id)
    WHERE
        gt.assessment_id = $assessment_id
    ) temp
GROUP BY GID, groupname
ORDER BY GID, groupname;


-- BLOCK open
WITH results AS (
    UPDATE assessment_instances AS ai
    SET
        open = true,
        date_limit = NULL,
        auto_close = FALSE
    WHERE
        ai.id = $assessment_instance_id
    RETURNING
        ai.open,
        ai.id AS assessment_instance_id
)
INSERT INTO assessment_state_logs AS asl
        (open, assessment_instance_id, auth_user_id)
(
    SELECT
        true, results.assessment_instance_id, $authn_user_id
    FROM
        results
);
