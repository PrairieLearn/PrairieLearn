-- BLOCK select_admins
SELECT
  u.*
FROM
  administrators
  JOIN users AS u ON (u.user_id = administrators.user_id)
ORDER BY
  u.uid,
  u.user_id;

-- BLOCK delete_admin_by_user_id
WITH
  deleted_row AS (
    DELETE FROM administrators
    WHERE
      user_id = $user_id
    RETURNING
      *
  ),
  audit_log AS (
    INSERT INTO
      audit_logs (
        authn_user_id,
        user_id,
        table_name,
        row_id,
        action,
        old_state
      )
    SELECT
      $authn_user_id,
      $user_id,
      'administrators',
      deleted_row.id,
      'delete',
      to_jsonb(deleted_row)
    FROM
      deleted_row
  )
SELECT
  *
from
  deleted_row;

-- BLOCK insert_admin_by_user_uid
WITH
  inserted_row AS (
    INSERT INTO
      administrators (user_id)
    SELECT
      user_id
    FROM
      users
    WHERE
      uid = $uid
    RETURNING
      *
  ),
  audit_log AS (
    INSERT INTO
      audit_logs (
        authn_user_id,
        user_id,
        table_name,
        row_id,
        action,
        new_state
      )
    SELECT
      $authn_user_id,
      inserted_row.user_id,
      'administrators',
      inserted_row.id,
      'insert',
      to_jsonb(inserted_row)
    FROM
      inserted_row
  )
SELECT
  *
FROM
  inserted_row;
