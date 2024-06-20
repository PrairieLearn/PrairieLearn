CREATE TABLE page_view_logs (
  id bigserial PRIMARY KEY,
  date timestamp with time zone NOT NULL DEFAULT now(),
  user_id BIGINT NOT NULL REFERENCES users ON DELETE CASCADE ON UPDATE CASCADE,
  authn_user_id BIGINT NOT NULL REFERENCES users ON DELETE CASCADE ON UPDATE CASCADE,
  course_instance_id BIGINT REFERENCES course_instances ON DELETE CASCADE ON UPDATE CASCADE,
  assessment_id BIGINT REFERENCES assessments ON DELETE CASCADE ON UPDATE CASCADE,
  assessment_instance_id BIGINT REFERENCES assessment_instances ON DELETE CASCADE ON UPDATE CASCADE,
  question_id BIGINT REFERENCES questions ON DELETE CASCADE ON UPDATE CASCADE,
  variant_id BIGINT REFERENCES variants ON DELETE CASCADE ON UPDATE CASCADE,
  page_type TEXT,
  path TEXT
);

CREATE INDEX page_view_logs_date_idx ON page_view_logs (date);

CREATE INDEX page_view_logs_assessment_id_date_idx ON page_view_logs (assessment_id, date);

CREATE INDEX page_view_logs_course_instance_id_date_idx ON page_view_logs (course_instance_id, date);

CREATE INDEX page_view_logs_user_id_assessment_instance_id_date_idx ON page_view_logs (user_id, assessment_instance_id, date);
