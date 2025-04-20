-- BLOCK insert_host_com_institution
WITH
  institution_insert AS (
    INSERT INTO
      institutions (id, short_name, long_name, uid_regexp)
    VALUES
      (100, 'host.com', 'Host Institution', '@host.com$')
  )
INSERT INTO
  institution_authn_providers (institution_id, authn_provider_id)
VALUES
  (100, 1),
  (100, 3),
  (100, 5);

-- BLOCK insert_example_com_institution
WITH
  institution_insert AS (
    INSERT INTO
      institutions (id, short_name, long_name, uid_regexp)
    VALUES
      (
        200,
        'example.com',
        'Example University',
        '@example.com$'
      )
  )
INSERT INTO
  institution_authn_providers (institution_id, authn_provider_id)
VALUES
  (200, 1),
  (200, 2),
  (200, 5);
