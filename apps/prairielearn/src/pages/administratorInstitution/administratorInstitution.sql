 -- BLOCK select_institution
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
WHERE
  i.id = $id

-- BLOCK edit_institution
UPDATE
  institutions
SET
  long_name = $long_name,
  short_name = $short_name,
  display_timezone = $display_timezone,
  yearly_enrollment_limit = $yearly_enrollment_limit::BIGINT,
  course_instance_enrollment_limit = $course_instance_enrollment_limit::BIGINT,
  uid_regexp = $uid_regexp
WHERE
  id = $id;

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

-- BLOCK remove_institution_authn_provider
DELETE FROM
  institution_authn_providers
WHERE
  institution_id = $institution_id
  AND authn_provider_id = (
    SELECT
      id
    FROM
      authn_providers
    WHERE
      name = $authn_provider_name
  );
