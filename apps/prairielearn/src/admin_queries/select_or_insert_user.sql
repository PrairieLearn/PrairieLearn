SELECT
  *
FROM
  users_select_or_insert (
    $uid,
    $name,
    NULLIF($uin, ''),
    NULLIF($email, ''),
    NULL
  );
