SELECT
  setval('institutions_id_seq', max(id))
FROM
  institutions;

INSERT INTO
  institutions (long_name, short_name)
VALUES
  ('Learning Tools Interoperability', 'LTI');
