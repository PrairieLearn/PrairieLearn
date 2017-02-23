CREATE TABLE IF NOT EXISTS variant_view_logs (
    id BIGSERIAL PRIMARY KEY,
    variant_id BIGINT NOT NULL REFERENCES variants ON DELETE CASCADE ON UPDATE CASCADE,
    access_log_id BIGINT UNIQUE NOT NULL REFERENCES access_logs ON DELETE CASCADE ON UPDATE CASCADE,
    open BOOLEAN,
    credit INTEGER
);

CREATE INDEX IF NOT EXISTS variant_view_logs_variant_id_idx ON variant_view_logs (variant_id);
