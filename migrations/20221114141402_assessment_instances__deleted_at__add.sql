ALTER TABLE assessment_instances
    ADD IF NOT EXISTS deleted_at TIMESTAMPTZ;
