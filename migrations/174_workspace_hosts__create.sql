CREATE TABLE IF NOT EXISTS workspaces (
    id: bigserial PRIMARY KEY,
    instance_id text,
    hostname text
);
