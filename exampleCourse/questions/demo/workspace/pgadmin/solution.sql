SELECT
  "colour",
  COUNT(*) AS "count"
FROM
  "foods"
GROUP BY
  "colour"
ORDER BY
  "count" DESC;
