-- BLOCK get_mode
SELECT COALESCE($force_mode, ip_to_mode($ip, $req_date, $authn_user_id)) AS mode;
