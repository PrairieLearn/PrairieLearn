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
  i.id ASC;

-- BLOCK add_institution
INSERT INTO
  institutions
  (long_name, short_name, display_timezone, uid_regexp)
VALUES
  ($long_name, $short_name, $display_timezone, $uid_regexp)


-- BLOCK add_institution_authn_provider
INSERT INTO
  institution_authn_providers
  (institution_id, authn_provider_id)
VALUES
  ($institution_id, 
    (SELECT
        id
      FROM
        authn_providers
      WHERE
        name = $authn_provider_name
    )
  )
ON CONFLICT DO NOTHING;
