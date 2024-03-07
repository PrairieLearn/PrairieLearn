-- BLOCK select_institutions
SELECT
  to_jsonb(i.*) AS institution,
  coalesce(
    (
      SELECT
        jsonb_agg(
          ap.name
          ORDER BY
            ap.name
        )
      FROM
        institution_authn_providers AS iap
        JOIN authn_providers AS ap ON (ap.id = iap.authn_provider_id)
      WHERE
        iap.institution_id = i.id
    ),
    '[]'::jsonb
  ) AS authn_providers
FROM
  institutions AS i
ORDER BY
  i.short_name,
  i.long_name,
  i.id;

-- BLOCK insert_institution
INSERT INTO
  institutions (
    long_name,
    short_name,
    display_timezone,
    uid_regexp
  )
VALUES
  (
    $long_name,
    $short_name,
    $display_timezone,
    $uid_regexp
  );
