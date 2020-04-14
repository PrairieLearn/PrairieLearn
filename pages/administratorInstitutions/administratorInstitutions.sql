-- BLOCK select
WITH
select_institutions_with_authn_providers AS (
    SELECT
        i.*,
        coalesce(
            jsonb_agg(ap.name ORDER BY ap.name),
            '[]'::jsonb
        ) AS authn_providers
    FROM
        institutions AS i
        LEFT JOIN institution_authn_providers AS iap ON (iap.institution_id = i.id)
        LEFT JOIN authn_providers AS ap ON (ap.id = iap.authn_provider_id)
    GROUP BY i.id
),
select_institutions AS (
    SELECT
        coalesce(
            jsonb_agg(i ORDER BY i.short_name),
            '[]'::jsonb
        ) AS institutions
    FROM
        select_institutions_with_authn_providers AS i
)
SELECT
    institutions
FROM
    select_institutions;

-- BLOCK select_course
SELECT * FROM pl_courses WHERE id = $course_id;
