-- BLOCK select
WITH
select_networks AS (
    SELECT
        coalesce(
            jsonb_agg(jsonb_build_object(
                    'network', n.network,
                    'start_date', coalesce(format_date_full_compact(lower(n.during), config_select('display_timezone')), '—'),
                    'end_date', coalesce(format_date_full_compact(upper(n.during), config_select('display_timezone')), '—'),
                    'location', n.location,
                    'purpose', n.purpose
                ) ORDER BY n.during, n.network),
            '[]'::jsonb
        ) AS networks
    FROM
        exam_mode_networks AS n
)
SELECT
    networks
FROM
    select_networks;
