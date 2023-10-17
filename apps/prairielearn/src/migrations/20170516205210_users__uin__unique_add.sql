DO $$
BEGIN
    IF EXISTS (
            -- do we have a non-constraint index on users.uin called 'users_uin_key'?
            SELECT 1
            FROM
                pg_catalog.pg_class AS c
                JOIN pg_catalog.pg_index AS i ON (i.indrelid = c.oid)
                JOIN pg_catalog.pg_class AS c2 ON (c2.oid = i.indexrelid)
                JOIN LATERAL generate_subscripts(i.indkey, 1) AS subs(sub) ON TRUE
                JOIN pg_attribute AS a ON (a.attrelid = c.oid AND a.attnum = i.indkey[sub])
                LEFT JOIN pg_catalog.pg_constraint AS con
                    ON (con.conrelid = i.indrelid AND con.conindid = i.indexrelid)
            WHERE
                c.relname = 'users'
                AND c2.relname = 'users_uin_key'
                AND a.attname = 'uin'
                AND con.contype IS DISTINCT FROM 'u'
        )
        THEN
        DROP INDEX IF EXISTS users_uin_key;
        ALTER TABLE users ADD UNIQUE (uin);
    END IF;
END;
$$;
