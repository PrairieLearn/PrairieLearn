ALTER SEQUENCE IF EXISTS courses_id_seq
RENAME TO pl_courses_id_seq;

DO $$
BEGIN
    IF EXISTS (
            -- do we have an index called "courses_pkey" on table "pl_courses"?
            SELECT 1
            FROM
                pg_catalog.pg_class AS c
                JOIN pg_catalog.pg_index AS i ON (i.indrelid = c.oid)
                JOIN pg_catalog.pg_class AS c2 ON (c2.oid = i.indexrelid)
            WHERE
                c.relname = 'pl_courses'
                AND c2.relname = 'courses_pkey'
        )
        THEN
        ALTER INDEX courses_pkey RENAME TO pl_courses_pkey;
    END IF;
END;
$$;

ALTER INDEX IF EXISTS courses_pkey1
RENAME TO courses_pkey;
