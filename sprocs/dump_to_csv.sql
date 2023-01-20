CREATE FUNCTION
    dump_to_csv(
        prefix text,
        anon boolean DEFAULT false
    ) RETURNS void
AS $$
DECLARE
    tablename text;
    filename text;
    command text;
BEGIN
    FOR tablename IN
        SELECT c.relname
        FROM pg_catalog.pg_class AS c
        JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r'
    LOOP
        -- skip the 'users' table if we are doing an anonymized dump
        CONTINUE WHEN anon AND tablename = 'users';

        filename := prefix || tablename || '.csv';

        command := format('COPY %I TO %L WITH (FORMAT ''csv'', HEADER, ENCODING ''UTF8'');', tablename, filename);
        RAISE NOTICE '%', command;
        EXECUTE command;
    END LOOP;
END;
$$ LANGUAGE plpgsql VOLATILE;
