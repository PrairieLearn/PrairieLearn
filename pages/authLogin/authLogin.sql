-- BLOCK get_mode
SELECT COALESCE($force_mode, ip_to_mode($ip, $req_date)) AS mode;
