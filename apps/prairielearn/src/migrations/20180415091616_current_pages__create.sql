CREATE TABLE current_pages (
  id bigserial PRIMARY KEY,
  date timestamp with time zone NOT NULL DEFAULT now(),
  user_id BIGINT UNIQUE NOT NULL REFERENCES users ON DELETE CASCADE ON UPDATE CASCADE,
  authn_user_id BIGINT NOT NULL REFERENCES users ON DELETE CASCADE ON UPDATE CASCADE,
  question_id BIGINT REFERENCES questions ON DELETE CASCADE ON UPDATE CASCADE,
  assessment_id BIGINT REFERENCES assessments ON DELETE CASCADE ON UPDATE CASCADE,
  assessment_instance_id BIGINT REFERENCES assessment_instances ON DELETE CASCADE ON UPDATE CASCADE,
  course_instance_id BIGINT REFERENCES course_instances ON DELETE CASCADE ON UPDATE CASCADE,
  variant_id BIGINT REFERENCES variants ON DELETE CASCADE ON UPDATE CASCADE,
  page_type TEXT,
  path TEXT
);

CREATE INDEX current_pages_date_idx ON current_pages (date);
