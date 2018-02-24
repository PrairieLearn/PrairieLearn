/* From PS exam_times as of 2018-02-24 */

CREATE TABLE IF NOT EXISTS exam_times (
  exam_time_id BIGSERIAL PRIMARY KEY,
  start_time timestamp with time zone NOT NULL,
  location_id bigint references locations(location_id) NOT NULL DEFAULT 1
);
