CREATE TABLE IF NOT EXISTS workspaces (
    id: bigserial PRIMARY KEY,
    s3_bucket text,
    s3_root_key text,
    state text,
    variant_id bigint REFERENCES submissions(variant_id) ON DELETE CASCADE ON UPDATE CASCADE,
    workspace_host_id bigint REFERENCES workspace_hosts(id) ON DELETE CASCADE ON UPDATE CASCADE
);
