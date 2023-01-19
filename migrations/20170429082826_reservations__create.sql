CREATE TABLE IF NOT EXISTS reservations (
  reservation_id BIGSERIAL PRIMARY KEY,
  exam_id bigint references exams,
  user_id bigint references users,
  delete_date timestamp with time zone,
  access_start timestamp with time zone,
  access_end timestamp with time zone
);
