ALTER TABLE variants
ADD COLUMN IF NOT EXISTS authn_user_id bigint;

DO $$
BEGIN
    IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints
            WHERE constraint_name = 'variants_authn_user_id_fkey'
        )
        THEN
        ALTER TABLE variants ADD FOREIGN KEY (authn_user_id) REFERENCES users ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END;
$$;
