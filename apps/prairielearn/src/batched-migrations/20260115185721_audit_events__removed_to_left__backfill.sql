-- BLOCK select_bounds
SELECT
  MAX(id)
FROM
  audit_events;

-- BLOCK update_audit_events_removed_to_left
UPDATE audit_events
SET
  action_detail = 'left',
  old_row = CASE
    WHEN old_row ->> 'status' = 'removed' THEN jsonb_set(old_row, '{status}', '"left"')
    ELSE old_row
  END,
  new_row = CASE
    WHEN new_row ->> 'status' = 'removed' THEN jsonb_set(new_row, '{status}', '"left"')
    ELSE new_row
  END
WHERE
  table_name = 'enrollments'
  AND action_detail = 'removed'
  AND id >= $start
  AND id <= $end;
