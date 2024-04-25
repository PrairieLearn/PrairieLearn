CREATE TABLE IF NOT EXISTS exams (
  exam_id BIGSERIAL PRIMARY KEY,
  course_id bigint references courses (course_id) NOT NULL
);
