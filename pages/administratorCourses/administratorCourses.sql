-- BLOCK select
WITH
select_courses AS (
    SELECT
        coalesce(
            jsonb_agg(jsonb_set(to_jsonb(c), '{institution}', to_jsonb(i)) ORDER BY i.short_name, c.short_name, c.title, c.id),
            '[]'::jsonb
        ) AS courses
    FROM
        pl_courses AS c
        JOIN institutions AS i ON (i.id = c.institution_id)
    WHERE
        c.deleted_at IS NULL
),
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
    courses,
    institutions
FROM
    select_courses,
    select_institutions;

-- BLOCK select_course
SELECT * FROM pl_courses WHERE id = $course_id;
