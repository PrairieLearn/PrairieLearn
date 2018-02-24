/* From PS reservations as of 2018-02-24 */

ALTER TABLE reservations ADD COLUMN IF NOT EXISTS exam_time_id bigint references exam_times(exam_time_id) NOT NULL;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS duration numeric;
