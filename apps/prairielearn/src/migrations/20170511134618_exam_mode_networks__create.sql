CREATE TABLE IF NOT EXISTS exam_mode_networks (
  id bigserial primary key,
  created_at timestamptz DEFAULT current_timestamp,
  network cidr,
  during tstzrange,
  location text,
  purpose text
);
