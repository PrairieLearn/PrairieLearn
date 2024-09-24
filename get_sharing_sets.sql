-- docker exec -it mypl psql postgres -f PrairieLearn/get_sharing_sets.sql > sharing_sets.csv
COPY (
  SELECT
    ss.name
  FROM
    sharing_sets AS ss
  WHERE
    ss.course_id = 2
) TO STDOUT
With
  (FORMAT CSV, HEADER);
