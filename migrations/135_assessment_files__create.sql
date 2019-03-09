CREATE TABLE assessment_files (
    id bigserial PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users ON DELETE CASCADE ON UPDATE CASCADE,
    assessment_id BIGINT NOT NULL REFERENCES assessments ON DELETE CASCADE ON UPDATE CASCADE,
    assessment_instance_id BIGINT REFERENCES assessment_instances ON DELETE CASCADE ON UPDATE CASCADE,
    reservation_id BIGINT REFERENCES reservations ON DELETE SET NULL ON UPDATE CASCADE,
    created_at timestamptz NOT NULL,
    created_by BIGINT NOT NULL REFERENCES users ON DELETE SET NULL ON UPDATE CASCADE,
    deleted_at timestamptz,
    deleted_by BIGINT REFERENCES users ON DELETE SET NULL ON UPDATE CASCADE,
    display_filename text NOT NULL,
    storage_filename text NOT NULL UNIQUE,
    type text NOT NULL
);

CREATE INDEX assessment_files_assessment_id_user_id_idx ON assessment_files (assessment_id,user_id);
CREATE INDEX assessment_files_assessment_instance_id_idx ON assessment_files (assessment_instance_id);
