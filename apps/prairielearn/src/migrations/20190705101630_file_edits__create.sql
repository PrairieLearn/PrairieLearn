CREATE TABLE file_edits (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users ON DELETE CASCADE ON UPDATE CASCADE,
  course_id BIGINT NOT NULL REFERENCES pl_courses ON DELETE CASCADE ON UPDATE CASCADE,
  dir_name TEXT NOT NULL,
  file_name TEXT NOT NULL,
  commit_hash TEXT NOT NULL,
  local_tmp_dir TEXT,
  s3_bucket TEXT,
  deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE UNIQUE INDEX file_edits_ui_ci_dn_fn_deleted_at_null_idx ON file_edits (user_id, course_id, dir_name, file_name)
WHERE
  deleted_at IS NULL;
