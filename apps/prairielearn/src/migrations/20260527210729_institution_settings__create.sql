CREATE TABLE institution_settings (
  institution_id bigint PRIMARY KEY REFERENCES institutions ON UPDATE CASCADE ON DELETE CASCADE,
  course_request_message text
);
