-- Initial state, as of 9c698b433f583a1df5f7450f60689424570988a4
---------------------------------
-- Types
---------------------------------
-- enum_mode
DO $$
BEGIN
    IF NOT EXISTS (SELECT * FROM pg_type WHERE typname = 'enum_mode') THEN
        CREATE TYPE enum_mode AS ENUM ('Public', 'Exam');
    END IF;
END;
$$;

-- enum_question_type
DO $$
BEGIN
    IF NOT EXISTS (SELECT * FROM pg_type WHERE typname = 'enum_question_type') THEN
        CREATE TYPE enum_question_type AS ENUM ('Calculation', 'ShortAnswer', 'MultipleChoice', 'Checkbox', 'File', 'MultipleTrueFalse');
    END IF;
END;
$$;

-- enum_role
DO $$
BEGIN
    IF NOT EXISTS (SELECT * FROM pg_type WHERE typname = 'enum_role') THEN
        CREATE TYPE enum_role AS ENUM ('None', 'Student', 'TA', 'Instructor', 'Superuser');
    END IF;
END;
$$;

-- enum_course_role.sql
DO $$
BEGIN
    IF NOT EXISTS (SELECT * FROM pg_type WHERE typname = 'enum_course_role') THEN
        CREATE TYPE enum_course_role AS ENUM ('None', 'Viewer', 'Editor', 'Owner');
    END IF;
END;
$$;

-- enum_submission_type.sql
DO $$
BEGIN
    IF NOT EXISTS (SELECT * FROM pg_type WHERE typname = 'enum_submission_type') THEN
        CREATE TYPE enum_submission_type AS ENUM ('check', 'score', 'practice');
    END IF;
END;
$$;

-- enum_assessment_type.sql
DO $$
BEGIN
    IF NOT EXISTS (SELECT * FROM pg_type WHERE typname = 'enum_assessment_type') THEN
        CREATE TYPE enum_assessment_type AS ENUM ('Exam', 'RetryExam', 'Basic', 'Game', 'Homework');
    END IF;
END;
$$;

-- enum_auth_action.sql
DO $$
BEGIN
    IF NOT EXISTS (SELECT * FROM pg_type WHERE typname = 'enum_auth_action') THEN
        CREATE TYPE enum_auth_action AS ENUM ('View', 'Edit');
    END IF;
END;
$$;

-- enum_grading_method.sql
DO $$
BEGIN
    IF NOT EXISTS (SELECT * FROM pg_type WHERE typname = 'enum_grading_method') THEN
        CREATE TYPE enum_grading_method AS ENUM ('Internal', 'External', 'Manual');
    END IF;
END;
$$;

-- enum_job_status
DO $$
BEGIN
    IF NOT EXISTS (SELECT * FROM pg_type WHERE typname = 'enum_job_status') THEN
        CREATE TYPE enum_job_status AS ENUM ('Running', 'Success', 'Error');
    END IF;
END;
$$;

---------------------------------
-- Top-level Tables
---------------------------------
-- users
CREATE TABLE IF NOT EXISTS users (
  user_id BIGSERIAL PRIMARY KEY,
  uid text UNIQUE NOT NULL,
  uin char(9) UNIQUE,
  name text
);

-- administrators
CREATE TABLE IF NOT EXISTS administrators (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL UNIQUE REFERENCES users ON DELETE CASCADE ON UPDATE CASCADE
);

-- pl_courses
CREATE TABLE IF NOT EXISTS pl_courses (
  id BIGSERIAL PRIMARY KEY,
  short_name text,
  title text,
  display_timezone text,
  grading_queue text,
  path text,
  repository text,
  deleted_at TIMESTAMP WITH TIME ZONE
);

-- course_permissions
CREATE TABLE IF NOT EXISTS course_permissions (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users ON DELETE CASCADE ON UPDATE CASCADE,
  course_id BIGINT NOT NULL REFERENCES pl_courses ON DELETE CASCADE ON UPDATE CASCADE,
  course_role enum_course_role,
  UNIQUE (user_id, course_id)
);

---------------------------------
-- Tables synced from git repo
---------------------------------
-- course_instances
CREATE TABLE IF NOT EXISTS course_instances (
  id BIGSERIAL PRIMARY KEY,
  uuid UUID NOT NULL UNIQUE,
  course_id BIGINT NOT NULL REFERENCES pl_courses ON DELETE CASCADE ON UPDATE CASCADE,
  short_name text,
  long_name text,
  number INTEGER,
  display_timezone text,
  deleted_at TIMESTAMP WITH TIME ZONE
);

-- course_instance_access_rules
CREATE TABLE IF NOT EXISTS course_instance_access_rules (
  id BIGSERIAL PRIMARY KEY,
  course_instance_id BIGINT NOT NULL REFERENCES course_instances ON DELETE CASCADE ON UPDATE CASCADE,
  number INTEGER,
  role enum_role,
  uids text[],
  start_date TIMESTAMP WITH TIME ZONE,
  end_date TIMESTAMP WITH TIME ZONE,
  UNIQUE (number, course_instance_id)
);

-- topics
CREATE TABLE IF NOT EXISTS topics (
  id BIGSERIAL PRIMARY KEY,
  name text,
  number INTEGER,
  color text,
  description text,
  course_id BIGINT NOT NULL REFERENCES pl_courses ON DELETE CASCADE ON UPDATE CASCADE,
  UNIQUE (name, course_id)
);

-- questions
CREATE TABLE IF NOT EXISTS questions (
  id BIGSERIAL PRIMARY KEY,
  uuid UUID NOT NULL UNIQUE,
  qid text,
  directory text,
  template_directory text,
  type enum_question_type,
  title text,
  config JSONB,
  options JSONB,
  client_files TEXT[] DEFAULT ARRAY[]::TEXT[],
  number INTEGER,
  grading_method enum_grading_method NOT NULL DEFAULT 'Internal',
  course_id BIGINT NOT NULL REFERENCES pl_courses ON DELETE CASCADE ON UPDATE CASCADE,
  topic_id BIGINT REFERENCES topics ON DELETE SET NULL ON UPDATE CASCADE,
  deleted_at TIMESTAMP WITH TIME ZONE,
  UNIQUE (number, course_id)
);

-- tags
CREATE TABLE IF NOT EXISTS tags (
  id BIGSERIAL PRIMARY KEY,
  name text,
  number INTEGER,
  color text,
  description text,
  course_id BIGINT NOT NULL REFERENCES pl_courses ON DELETE CASCADE ON UPDATE CASCADE,
  UNIQUE (name, course_id)
);

-- question_tags
CREATE TABLE IF NOT EXISTS question_tags (
  id BIGSERIAL PRIMARY KEY,
  question_id BIGINT NOT NULL REFERENCES questions ON DELETE CASCADE ON UPDATE CASCADE,
  tag_id BIGINT NOT NULL REFERENCES tags ON DELETE CASCADE ON UPDATE CASCADE,
  number INTEGER,
  UNIQUE (question_id, tag_id)
);

-- assessment_sets
CREATE TABLE IF NOT EXISTS assessment_sets (
  id BIGSERIAL PRIMARY KEY,
  abbreviation text,
  name text,
  heading text,
  color text,
  number INTEGER,
  course_id BIGINT NOT NULL REFERENCES pl_courses ON DELETE CASCADE ON UPDATE CASCADE,
  UNIQUE (name, course_id)
);

-- assessments
CREATE TABLE IF NOT EXISTS assessments (
  id BIGSERIAL PRIMARY KEY,
  uuid UUID NOT NULL UNIQUE,
  tid text,
  course_instance_id BIGINT NOT NULL REFERENCES course_instances ON DELETE CASCADE ON UPDATE CASCADE,
  type enum_assessment_type,
  number text,
  order_by integer,
  title text,
  config JSONB,
  text TEXT,
  multiple_instance boolean,
  shuffle_questions boolean DEFAULT false,
  max_points DOUBLE PRECISION,
  assessment_set_id BIGINT REFERENCES assessment_sets ON DELETE SET NULL ON UPDATE CASCADE,
  deleted_at TIMESTAMP WITH TIME ZONE,
  obj JSONB
);

-- zones
CREATE TABLE IF NOT EXISTS zones (
  id BIGSERIAL PRIMARY KEY,
  title text,
  number INTEGER,
  number_choose INTEGER, -- NULL means choose all
  assessment_id BIGINT NOT NULL REFERENCES assessments ON DELETE CASCADE ON UPDATE CASCADE,
  UNIQUE (number, assessment_id)
);

-- alternative_groups
CREATE TABLE IF NOT EXISTS alternative_groups (
  id BIGSERIAL PRIMARY KEY,
  number INTEGER,
  number_choose INTEGER, -- NULL means choose all
  zone_id BIGINT NOT NULL REFERENCES zones ON DELETE CASCADE ON UPDATE CASCADE,
  assessment_id BIGINT NOT NULL REFERENCES assessments ON DELETE CASCADE ON UPDATE CASCADE,
  UNIQUE (number, assessment_id)
);

-- assessment_access_rules
CREATE TABLE IF NOT EXISTS assessment_access_rules (
  id BIGSERIAL PRIMARY KEY,
  assessment_id BIGINT NOT NULL REFERENCES assessments ON DELETE CASCADE ON UPDATE CASCADE,
  number INTEGER,
  mode enum_mode,
  role enum_role,
  uids text[],
  start_date TIMESTAMP WITH TIME ZONE,
  end_date TIMESTAMP WITH TIME ZONE,
  credit INTEGER,
  UNIQUE (number, assessment_id)
);

-- assessment_questions
CREATE TABLE IF NOT EXISTS assessment_questions (
  id BIGSERIAL PRIMARY KEY,
  number INTEGER,
  max_points DOUBLE PRECISION,
  points_list DOUBLE PRECISION[],
  init_points DOUBLE PRECISION,
  assessment_id BIGINT NOT NULL REFERENCES assessments ON DELETE CASCADE ON UPDATE CASCADE,
  alternative_group_id BIGINT REFERENCES alternative_groups ON DELETE SET NULL ON UPDATE CASCADE,
  number_in_alternative_group INTEGER,
  question_id BIGINT NOT NULL REFERENCES questions ON DELETE CASCADE ON UPDATE CASCADE,
  deleted_at TIMESTAMP WITH TIME ZONE,
  UNIQUE (question_id, assessment_id)
);

---------------------------------
-- Tables created during operation
---------------------------------
-- enrollments
CREATE TABLE IF NOT EXISTS enrollments (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users ON DELETE CASCADE ON UPDATE CASCADE,
  course_instance_id BIGINT NOT NULL REFERENCES course_instances ON DELETE CASCADE ON UPDATE CASCADE,
  role enum_role,
  UNIQUE (user_id, course_instance_id)
);

-- assessment_instances
CREATE TABLE IF NOT EXISTS assessment_instances (
  id BIGSERIAL PRIMARY KEY,
  tiid text UNIQUE, -- temporary, delete after Mongo import
  qids JSONB, -- temporary, delete after Mongo import
  obj JSONB, -- temporary, delete after Mongo import
  date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  mode enum_mode, -- mode at creation
  number INTEGER,
  open BOOLEAN DEFAULT TRUE,
  closed_at TIMESTAMP WITH TIME ZONE,
  instructor_opened BOOLEAN DEFAULT FALSE,
  duration INTERVAL DEFAULT INTERVAL '0 seconds',
  assessment_id BIGINT NOT NULL REFERENCES assessments ON DELETE CASCADE ON UPDATE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users ON DELETE CASCADE ON UPDATE CASCADE,
  auth_user_id BIGINT REFERENCES users ON DELETE CASCADE ON UPDATE CASCADE,
  points DOUBLE PRECISION DEFAULT 0,
  points_in_grading DOUBLE PRECISION DEFAULT 0,
  max_points DOUBLE PRECISION,
  score_perc DOUBLE PRECISION DEFAULT 0,
  score_perc_in_grading DOUBLE PRECISION DEFAULT 0,
  UNIQUE (number, assessment_id, user_id)
);

-- instance_questions
CREATE TABLE IF NOT EXISTS instance_questions (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  open BOOLEAN DEFAULT TRUE,
  number INTEGER,
  order_by INTEGER DEFAULT floor(random() * 1000000),
  points DOUBLE PRECISION DEFAULT 0,
  points_in_grading DOUBLE PRECISION DEFAULT 0,
  score_perc DOUBLE PRECISION DEFAULT 0,
  score_perc_in_grading DOUBLE PRECISION DEFAULT 0,
  current_value DOUBLE PRECISION,
  number_attempts INTEGER DEFAULT 0,
  points_list DOUBLE PRECISION[],
  assessment_instance_id BIGINT NOT NULL REFERENCES assessment_instances ON DELETE CASCADE ON UPDATE CASCADE,
  assessment_question_id BIGINT NOT NULL REFERENCES assessment_questions ON DELETE CASCADE ON UPDATE CASCADE,
  UNIQUE (assessment_question_id, assessment_instance_id)
);

-- variants
CREATE TABLE IF NOT EXISTS variants (
  id BIGSERIAL PRIMARY KEY,
  qiid text UNIQUE, -- temporary, delete after Mongo import
  date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  instance_question_id BIGINT NOT NULL REFERENCES instance_questions ON DELETE CASCADE ON UPDATE CASCADE,
  available BOOLEAN DEFAULT TRUE,
  number INTEGER,
  variant_seed text,
  params JSONB,
  true_answer JSONB,
  options JSONB,
  UNIQUE (number, instance_question_id)
);

-- submissions
CREATE TABLE IF NOT EXISTS submissions (
  id BIGSERIAL PRIMARY KEY,
  sid text UNIQUE, -- temporary, delete after Mongo import
  date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  variant_id BIGINT NOT NULL REFERENCES variants ON DELETE CASCADE ON UPDATE CASCADE,
  auth_user_id BIGINT REFERENCES users ON DELETE CASCADE ON UPDATE CASCADE,
  submitted_answer JSONB,
  type enum_submission_type,
  override_score DOUBLE PRECISION,
  credit INTEGER,
  mode enum_mode,
  grading_requested_at TIMESTAMP WITH TIME ZONE,
  graded_at TIMESTAMP WITH TIME ZONE,
  score DOUBLE PRECISION,
  correct BOOLEAN,
  feedback JSONB
);

-- job_sequences
CREATE TABLE IF NOT EXISTS job_sequences (
  id BIGSERIAL PRIMARY KEY,
  start_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  finish_date TIMESTAMP WITH TIME ZONE,
  course_id BIGINT REFERENCES pl_courses ON DELETE CASCADE ON UPDATE CASCADE,
  number INTEGER,
  user_id BIGINT REFERENCES users ON DELETE CASCADE ON UPDATE CASCADE,
  authn_user_id BIGINT REFERENCES users ON DELETE CASCADE ON UPDATE CASCADE,
  type TEXT,
  description TEXT,
  status enum_job_status DEFAULT 'Running',
  UNIQUE (course_id, number)
);

-- jobs
CREATE TABLE IF NOT EXISTS jobs (
  id BIGSERIAL PRIMARY KEY,
  start_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  finish_date TIMESTAMP WITH TIME ZONE,
  course_id BIGINT REFERENCES pl_courses ON DELETE CASCADE ON UPDATE CASCADE,
  number INTEGER,
  job_sequence_id BIGINT REFERENCES job_sequences ON DELETE CASCADE ON UPDATE CASCADE,
  number_in_sequence INTEGER,
  last_in_sequence BOOLEAN,
  user_id BIGINT REFERENCES users ON DELETE CASCADE ON UPDATE CASCADE,
  authn_user_id BIGINT REFERENCES users ON DELETE CASCADE ON UPDATE CASCADE,
  type TEXT,
  description TEXT,
  status enum_job_status,
  stdin TEXT,
  stdout TEXT,
  stderr TEXT,
  output TEXT,
  command TEXT,
  arguments TEXT[],
  working_directory TEXT,
  exit_code INTEGER,
  exit_signal TEXT,
  error_message TEXT,
  UNIQUE (course_id, number),
  UNIQUE (job_sequence_id, number_in_sequence)
);

---------------------------------
-- Tables for logging
---------------------------------
-- assessment_state_logs
CREATE TABLE IF NOT EXISTS assessment_state_logs (
  id BIGSERIAL PRIMARY KEY,
  date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  open BOOLEAN,
  assessment_instance_id BIGINT NOT NULL REFERENCES assessment_instances ON DELETE CASCADE ON UPDATE CASCADE,
  auth_user_id BIGINT REFERENCES users ON DELETE CASCADE ON UPDATE CASCADE
);

-- assessment_score_logs
CREATE TABLE IF NOT EXISTS assessment_score_logs (
  id BIGSERIAL PRIMARY KEY,
  date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  points DOUBLE PRECISION,
  points_in_grading DOUBLE PRECISION,
  max_points DOUBLE PRECISION,
  score_perc DOUBLE PRECISION,
  score_perc_in_grading DOUBLE PRECISION,
  assessment_instance_id BIGINT NOT NULL REFERENCES assessment_instances ON DELETE CASCADE ON UPDATE CASCADE,
  auth_user_id BIGINT REFERENCES users ON DELETE CASCADE ON UPDATE CASCADE
);

-- access_logs
CREATE TABLE IF NOT EXISTS access_logs (
  id BIGSERIAL PRIMARY KEY,
  mongo_id text UNIQUE,
  date timestamp with time zone,
  mode enum_mode,
  ip inet,
  forwarded_ip inet,
  auth_uid text,
  auth_role enum_role,
  user_uid text,
  user_role enum_role,
  method text,
  path text,
  params jsonb,
  body jsonb
);

-- variant_view_logs
CREATE TABLE IF NOT EXISTS variant_view_logs (
  id BIGSERIAL PRIMARY KEY,
  variant_id BIGINT NOT NULL REFERENCES variants ON DELETE CASCADE ON UPDATE CASCADE,
  access_log_id BIGINT UNIQUE NOT NULL REFERENCES access_logs ON DELETE CASCADE ON UPDATE CASCADE,
  open BOOLEAN,
  credit INTEGER
);

-- grading_logs
CREATE TABLE IF NOT EXISTS grading_logs (
  id BIGSERIAL PRIMARY KEY,
  date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  submission_id BIGINT NOT NULL REFERENCES submissions ON DELETE CASCADE ON UPDATE CASCADE,
  grading_method enum_grading_method,
  grading_requested_at TIMESTAMP WITH TIME ZONE,
  grading_request_canceled_at TIMESTAMP WITH TIME ZONE,
  grading_request_canceled_by BIGINT REFERENCES users ON DELETE CASCADE ON UPDATE CASCADE,
  graded_at TIMESTAMP WITH TIME ZONE,
  graded_by BIGINT REFERENCES users ON DELETE CASCADE ON UPDATE CASCADE,
  score DOUBLE PRECISION,
  correct BOOLEAN,
  feedback JSONB,
  auth_user_id BIGINT REFERENCES users ON DELETE CASCADE ON UPDATE CASCADE
);

-- question_score_logs
CREATE TABLE IF NOT EXISTS question_score_logs (
  id BIGSERIAL PRIMARY KEY,
  date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  instance_question_id BIGINT NOT NULL REFERENCES instance_questions ON DELETE CASCADE ON UPDATE CASCADE,
  auth_user_id BIGINT REFERENCES users ON DELETE CASCADE ON UPDATE CASCADE,
  points DOUBLE PRECISION,
  max_points DOUBLE PRECISION,
  score_perc DOUBLE PRECISION
);

-- audit_logs
CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  authn_user_id BIGINT,
  course_id BIGINT,
  course_instance_id BIGINT,
  user_id BIGINT,
  table_name TEXT,
  column_name TEXT,
  row_id BIGINT,
  action TEXT,
  parameters JSONB,
  old_state JSONB,
  new_state JSONB
);
