-- BLOCK select_lti13_roster_sync_readiness
WITH
  active_lti13_institutions AS (
    SELECT DISTINCT
      institution_id
    FROM
      lti13_instances
    WHERE
      deleted_at IS NULL
  ),
  normalized_user_uins AS (
    SELECT
      u.institution_id,
      NULLIF(btrim(u.uin), '') AS uin
    FROM
      users AS u
      JOIN active_lti13_institutions AS ali ON (ali.institution_id = u.institution_id)
  ),
  categorized_user_uins AS (
    SELECT
      institution_id,
      CASE
        WHEN uin IS NULL THEN 'missing'
        -- PrairieLearn stores Google OIDC subjects as UINs, and those subjects are
        -- 21-digit decimals. These values may remain after an institution switches
        -- authentication providers. Azure object IDs are UUID-shaped, but some
        -- institutions intentionally use GUIDs as their canonical SAML UIN, so these
        -- categories identify likely provenance rather than validity.
        WHEN uin ~ '^[0-9]{21}$' THEN '21-digit decimal (Google subject candidate)'
        WHEN uin ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN 'GUID-shaped'
        WHEN uin ~* '^[0-9a-f]{32}$'
        AND uin ~* '[a-f]' THEN '32-character hexadecimal'
        WHEN uin ~ '^[0-9]+$' THEN length(uin) || '-digit decimal'
        WHEN uin ~ '^[A-Za-z0-9]+$' THEN length(uin) || '-character alphanumeric'
        ELSE length(uin) || '-character other'
      END AS category
    FROM
      normalized_user_uins
  ),
  user_uin_category_counts AS (
    SELECT
      institution_id,
      category,
      count(*) AS user_count
    FROM
      categorized_user_uins
    GROUP BY
      institution_id,
      category
  ),
  user_uin_stats AS (
    SELECT
      institution_id,
      COALESCE(
        sum(user_count) FILTER (
          WHERE
            category = 'missing'
        ),
        0
      ) AS users_without_uin_count,
      COALESCE(
        sum(user_count) FILTER (
          WHERE
            category = '21-digit decimal (Google subject candidate)'
        ),
        0
      ) AS google_subject_candidate_count,
      COALESCE(
        jsonb_object_agg(
          category,
          user_count
          ORDER BY
            category
        ) FILTER (
          WHERE
            category != 'missing'
        ),
        '{}'::jsonb
      ) AS uin_category_counts
    FROM
      user_uin_category_counts
    GROUP BY
      institution_id
  )
SELECT
  i.id AS institution_id,
  i.short_name AS institution_short_name,
  i.long_name AS institution_long_name,
  li.id AS lti13_instance_id,
  li.name AS lti13_instance_name,
  li.platform,
  NULLIF(btrim(li.uin_attribute), '') AS lti13_uin_attribute,
  NULLIF(btrim(sp.uin_attribute), '') AS saml_uin_attribute,
  COALESCE(
    (
      SELECT
        array_agg(
          ap.name
          ORDER BY
            ap.id
        )
      FROM
        institution_authn_providers AS iap
        JOIN authn_providers AS ap ON (ap.id = iap.authn_provider_id)
      WHERE
        iap.institution_id = i.id
    ),
    ARRAY[]::text[]
  ) AS enabled_authn_provider_names,
  (
    SELECT
      count(*)
    FROM
      lti13_instances AS institution_li
    WHERE
      institution_li.institution_id = i.id
      AND institution_li.deleted_at IS NULL
      AND NULLIF(btrim(institution_li.uin_attribute), '') IS NULL
  ) AS active_lti13_instances_without_uin_count,
  COALESCE(uus.users_without_uin_count, 0) AS users_without_uin_count,
  COALESCE(uus.google_subject_candidate_count, 0) AS google_subject_candidate_count,
  COALESCE(uus.uin_category_counts, '{}'::jsonb) AS uin_category_counts
FROM
  lti13_instances AS li
  JOIN institutions AS i ON (i.id = li.institution_id)
  LEFT JOIN saml_providers AS sp ON (sp.institution_id = i.id)
  LEFT JOIN user_uin_stats AS uus ON (uus.institution_id = i.id)
WHERE
  li.deleted_at IS NULL
ORDER BY
  i.short_name,
  i.id,
  li.id;
