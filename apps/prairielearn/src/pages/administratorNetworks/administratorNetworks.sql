-- BLOCK select
SELECT
  n.network,
  lower(n.during) AS start_date,
  upper(n.during) AS end_date,
  n.location,
  n.purpose
FROM
  exam_mode_networks AS n
ORDER BY
  n.during,
  n.network;
