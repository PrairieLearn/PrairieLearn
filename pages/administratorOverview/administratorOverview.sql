-- BLOCK select
WITH
select_administrator_users AS (
    SELECT
        coalesce(jsonb_agg(jsonb_build_object(
            'id', u.id,
            'uid', u.uid,
            'name', u.name
        ) ORDER BY u.uid, u.id), '[]'::jsonb) AS administrator_users
    FROM
        administrators AS adm
        JOIN users AS u ON (u.id = adm.user_id)
)
SELECT
    select_administrator_users.administrator_users
FROM
    select_administrator_users
