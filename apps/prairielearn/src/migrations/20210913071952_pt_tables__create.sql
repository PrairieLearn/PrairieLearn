CREATE TABLE IF NOT EXISTS pt_exams (id bigserial PRIMARY KEY, uuid uuid);

CREATE TABLE IF NOT EXISTS pt_enrollments (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users
);

CREATE TABLE IF NOT EXISTS pt_reservations (
  id bigserial PRIMARY KEY,
  exam_id BIGINT NOT NULL REFERENCES pt_exams,
  enrollment_id BIGINT NOT NULL REFERENCES pt_enrollments,
  access_start TIMESTAMPTZ,
  access_end TIMESTAMPTZ
);
