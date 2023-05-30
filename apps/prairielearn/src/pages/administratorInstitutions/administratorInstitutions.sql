-- BLOCK select_institutions
SELECT
  to_jsonb(i.*) AS institution,
  coalesce(
    jsonb_agg(
      ap.name
      ORDER BY
        ap.name
    ),
    '[]'::jsonb
  ) AS authn_providers
FROM
  institutions AS i
  LEFT JOIN institution_authn_providers AS iap ON (iap.institution_id = i.id)
  LEFT JOIN authn_providers AS ap ON (ap.id = iap.authn_provider_id)
GROUP BY
  i.id;
