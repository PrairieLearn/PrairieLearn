DELETE FROM group_user_roles gur
WHERE
  NOT EXISTS (
    SELECT
      1
    FROM
      group_users gu
    WHERE
      gu.group_id = gur.group_id
      AND gu.user_id = gur.user_id
  );

ALTER TABLE group_user_roles
-- squawk-ignore constraint-missing-not-valid, adding-foreign-key-constraint
ADD FOREIGN KEY (group_id, user_id) REFERENCES group_users (group_id, user_id) ON DELETE CASCADE ON UPDATE CASCADE;
